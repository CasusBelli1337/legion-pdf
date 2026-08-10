import type Anthropic from '@anthropic-ai/sdk';
import {
  APIConnectionError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { AiChunk } from '@shared/types';
import {
  CENTURION_MODEL,
  CenturionError,
  CenturionService,
  MIN_MAX_TOKENS,
  RETRY_MULTIPLIER,
  clampCeiling,
  classifyError,
  readAskPayload,
} from './anthropic';
import type { CenturionAskPayload, CenturionClient, CenturionStream } from './anthropic';

interface FakeAttempt {
  deltas: string[];
  stopReason: Anthropic.StopReason;
  /** Defaults to the concatenated deltas. */
  text?: string;
}

function fakeMessage(text: string, stopReason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: CENTURION_MODEL,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  } as unknown as Anthropic.Message;
}

interface Recorder {
  client: CenturionClient;
  params: Anthropic.MessageStreamParams[];
  /** Rejects every stream with this error instead of answering. */
  failWith?: unknown;
}

function fakeClient(attempts: FakeAttempt[], failWith?: unknown): Recorder {
  const params: Anthropic.MessageStreamParams[] = [];
  let index = 0;
  const client: CenturionClient = {
    messages: {
      stream(streamParams: Anthropic.MessageStreamParams): CenturionStream {
        params.push(streamParams);
        const attempt = attempts[index++];
        let onText: ((delta: string, snapshot: string) => void) | null = null;
        return {
          on(_event: 'text', listener: (delta: string, snapshot: string) => void) {
            onText = listener;
            return this;
          },
          async finalMessage(): Promise<Anthropic.Message> {
            if (failWith !== undefined) throw failWith;
            if (attempt === undefined) throw new Error('fake client ran out of attempts');
            let snapshot = '';
            for (const delta of attempt.deltas) {
              snapshot += delta;
              onText?.(delta, snapshot);
            }
            return fakeMessage(attempt.text ?? snapshot, attempt.stopReason);
          },
        };
      },
    },
  };
  return { client, params, failWith };
}

function payload(overrides: Partial<CenturionAskPayload> = {}): CenturionAskPayload {
  return {
    docId: 'doc-1',
    messages: [{ role: 'user', content: 'What is this document about?' }],
    maxTokens: MIN_MAX_TOKENS,
    documentText: '[Page 1]\nSettlement agreement between Acme and Beta.',
    contextLabel: 'the whole document, pages 1-1',
    ...overrides,
  };
}

function serviceFor(recorder: Recorder): { service: CenturionService; chunks: AiChunk[] } {
  let counter = 0;
  const service = new CenturionService({
    apiKey: 'sk-ant-not-a-real-key',
    createClient: () => recorder.client,
    newRequestId: () => `req-${++counter}`,
  });
  return { service, chunks: [] };
}

describe('CenturionService happy path', () => {
  it('streams deltas under one request id and returns the finished answer', async () => {
    const recorder = fakeClient([
      { deltas: ['The ', 'agreement ', 'settles (p. 1).'], stopReason: 'end_turn' },
    ]);
    const { service, chunks } = serviceFor(recorder);

    const result = await service.ask(payload(), (chunk) => chunks.push(chunk));

    expect(result.stopReason).toBe('end_turn');
    expect(result.text).toBe('The agreement settles (p. 1).');
    expect(new Set(chunks.map((chunk) => chunk.requestId))).toEqual(new Set(['req-1']));
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
    expect(chunks.at(-1)).toEqual({ requestId: 'req-1', text: '', done: true });
  });

  it('sends the document as a cached prefix ahead of the question', async () => {
    const recorder = fakeClient([{ deltas: ['ok'], stopReason: 'end_turn' }]);
    const { service } = serviceFor(recorder);

    await service.ask(payload(), () => undefined);

    const sent = recorder.params[0] as Anthropic.MessageStreamParams;
    expect(sent.model).toBe(CENTURION_MODEL);
    expect(sent.max_tokens).toBe(MIN_MAX_TOKENS);
    expect(sent.thinking).toEqual({ type: 'adaptive' });
    expect(String(sent.system)).toContain('Cite the page for every fact');

    const first = sent.messages[0] as Anthropic.MessageParam;
    const [documentBlock, questionBlock] = first.content as Anthropic.TextBlockParam[];
    expect(first.role).toBe('user');
    expect(documentBlock).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(documentBlock?.text).toContain('[Page 1]');
    expect(questionBlock?.text).toBe('What is this document about?');
  });
});

describe('stop_reason handling (engineering rule 3)', () => {
  it('retries once at four times the ceiling when the answer is clipped', async () => {
    const recorder = fakeClient([
      { deltas: ['A clipped half-'], stopReason: 'max_tokens' },
      { deltas: ['A complete answer (p. 3).'], stopReason: 'end_turn' },
    ]);
    const { service, chunks } = serviceFor(recorder);

    const result = await service.ask(payload(), (chunk) => chunks.push(chunk));

    expect(recorder.params).toHaveLength(2);
    expect(recorder.params[0]?.max_tokens).toBe(MIN_MAX_TOKENS);
    expect(recorder.params[1]?.max_tokens).toBe(MIN_MAX_TOKENS * RETRY_MULTIPLIER);
    expect(result.text).toBe('A complete answer (p. 3).');
    expect(result.requestId).toBe('req-2');
  });

  it('never marks the clipped attempt done, so the panel discards it', async () => {
    const recorder = fakeClient([
      { deltas: ['A clipped half-'], stopReason: 'max_tokens' },
      { deltas: ['A complete answer (p. 3).'], stopReason: 'end_turn' },
    ]);
    const { service, chunks } = serviceFor(recorder);

    await service.ask(payload(), (chunk) => chunks.push(chunk));

    const terminal = chunks.filter((chunk) => chunk.done);
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.requestId).toBe('req-2');
    // The retry streams under its own id, which is the panel's signal to reset.
    expect(chunks.some((chunk) => chunk.requestId === 'req-1' && chunk.text !== '')).toBe(true);
    expect(chunks.some((chunk) => chunk.requestId === 'req-2' && chunk.text !== '')).toBe(true);
  });

  it('hard-fails rather than returning a clipped answer when the retry is clipped too', async () => {
    const recorder = fakeClient([
      { deltas: ['half '], stopReason: 'max_tokens' },
      { deltas: ['still half '], stopReason: 'max_tokens' },
    ]);
    const { service, chunks } = serviceFor(recorder);

    await expect(service.ask(payload(), (chunk) => chunks.push(chunk))).rejects.toMatchObject({
      code: 'CLIPPED',
    });
    expect(recorder.params).toHaveLength(2);
    // The indicator must still stop, and no chunk ever claimed a finished answer.
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
    expect(chunks.filter((chunk) => chunk.done)[0]?.text).toBe('');
  });

  it('does not retry when the ceiling is already at the model maximum', async () => {
    const recorder = fakeClient([{ deltas: ['half'], stopReason: 'max_tokens' }]);
    const { service } = serviceFor(recorder);

    await expect(
      service.ask(payload({ maxTokens: 128_000 }), () => undefined)
    ).rejects.toMatchObject({ code: 'CLIPPED' });
    expect(recorder.params).toHaveLength(1);
  });

  it('treats a refusal and a blown context window as their own failures', async () => {
    for (const [stopReason, code] of [
      ['refusal', 'DECLINED'],
      ['model_context_window_exceeded', 'CONTEXT_TOO_LONG'],
    ] as const) {
      const recorder = fakeClient([{ deltas: [], stopReason }]);
      const { service } = serviceFor(recorder);
      await expect(service.ask(payload(), () => undefined)).rejects.toMatchObject({ code });
    }
  });
});

describe('error taxonomy', () => {
  const headers = new Headers();

  /** The wire shape the API really sends: the reason lives in the JSON body. */
  function apiBody(type: string, message: string): object {
    return { type: 'error', error: { type, message } };
  }

  it('maps SDK failures onto plain-English codes', () => {
    const cases: [unknown, string][] = [
      [
        new AuthenticationError(
          401,
          apiBody('authentication_error', 'invalid x-api-key'),
          undefined,
          headers
        ),
        'BAD_KEY',
      ],
      [
        new PermissionDeniedError(
          403,
          apiBody('permission_error', 'no access'),
          undefined,
          headers
        ),
        'BAD_KEY',
      ],
      [
        new RateLimitError(429, apiBody('rate_limit_error', 'slow down'), undefined, headers),
        'RATE_LIMIT',
      ],
      [new APIConnectionError({ message: 'socket hang up' }), 'NETWORK'],
      [
        new BadRequestError(
          400,
          apiBody('invalid_request_error', 'prompt is too long: 1200000 tokens > 200000 maximum'),
          undefined,
          headers
        ),
        'CONTEXT_TOO_LONG',
      ],
      [
        new BadRequestError(
          400,
          apiBody('invalid_request_error', 'messages: unexpected role'),
          undefined,
          headers
        ),
        'BAD_REQUEST',
      ],
      [
        new InternalServerError(529, apiBody('overloaded_error', 'overloaded'), undefined, headers),
        'BUSY',
      ],
      [new Error('something unexpected'), 'UNKNOWN'],
    ];
    for (const [error, code] of cases) {
      expect(classifyError(error).code).toBe(code);
    }
  });

  it('falls back to the SDK summary when the body carries no message', () => {
    expect(
      classifyError(new BadRequestError(400, undefined, 'prompt is too long', headers)).code
    ).toBe('CONTEXT_TOO_LONG');
  });

  it('gives every failure a sentence an attorney can act on', () => {
    const failure = classifyError(new RateLimitError(429, {}, 'slow down', headers));
    expect(failure.message).toMatch(/Wait about a minute/);
    expect(failure.toIpcError().message).toBe(`[RATE_LIMIT] ${failure.message}`);
  });

  it('surfaces a transport failure through ask as NETWORK', async () => {
    const recorder = fakeClient([], new APIConnectionError({ message: 'ENOTFOUND' }));
    const { service, chunks } = serviceFor(recorder);

    await expect(service.ask(payload(), (chunk) => chunks.push(chunk))).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(chunks.at(-1)?.done).toBe(true);
  });
});

describe('request guards', () => {
  it('refuses a request that carries no document text', () => {
    for (const documentText of [undefined, '', '   ']) {
      expect(() => readAskPayload({ ...payload(), documentText } as CenturionAskPayload)).toThrow(
        CenturionError
      );
    }
  });

  it('refuses a conversation that does not start with the attorney', () => {
    expect(() =>
      readAskPayload(payload({ messages: [{ role: 'assistant', content: 'hello' }] }))
    ).toThrow(CenturionError);
  });

  it('defaults the context label but keeps a supplied one', () => {
    const withoutLabel = {
      ...payload(),
      contextLabel: undefined,
    } as unknown as CenturionAskPayload;
    expect(readAskPayload(withoutLabel).contextLabel).toBe('the whole document');
    expect(readAskPayload(payload()).contextLabel).toBe('the whole document, pages 1-1');
  });

  it('keeps the ceiling generous no matter what the panel asked for', () => {
    expect(clampCeiling(10)).toBe(MIN_MAX_TOKENS);
    expect(clampCeiling(Number.NaN)).toBe(MIN_MAX_TOKENS);
    expect(clampCeiling(1_000_000)).toBe(128_000);
    expect(clampCeiling(20_000)).toBe(20_000);
  });
});

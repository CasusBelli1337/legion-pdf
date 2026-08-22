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
import type { AiAskRequest, AiChunk } from '@shared/types';
import {
  CENTURION_MODEL,
  CENTURION_MESSAGES,
  CenturionService,
  MIN_MAX_TOKENS,
  RETRY_MULTIPLIER,
  clampCeiling,
  classifyError,
} from './anthropic';
import type { CenturionClient, CenturionStream } from './anthropic';
import { MAX_TOOL_TURNS } from './anthropic';
import { DECLINED_RESULT } from './centurion-tool-protocol';
import type { CenturionToolHooks } from './centurion-tool-protocol';
import type { CenturionToolCall, CenturionToolDecision } from '@shared/types';

interface FakeToolUse {
  id: string;
  name: string;
  input: unknown;
}

interface FakeAttempt {
  deltas: string[];
  stopReason: Anthropic.StopReason;
  /** Defaults to the concatenated deltas. */
  text?: string;
  /** tool_use blocks this turn ends with, alongside whatever text it wrote. */
  toolUses?: FakeToolUse[];
}

function fakeMessage(
  text: string,
  stopReason: Anthropic.StopReason,
  toolUses: FakeToolUse[] = []
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: CENTURION_MODEL,
    content: [
      { type: 'text', text, citations: null },
      ...toolUses.map((use) => ({ type: 'tool_use', ...use })),
    ],
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
            return fakeMessage(attempt.text ?? snapshot, attempt.stopReason, attempt.toolUses);
          },
        };
      },
    },
  };
  return { client, params, failWith };
}

function payload(overrides: Partial<AiAskRequest> = {}): AiAskRequest {
  return {
    docId: 'doc-1',
    messages: [{ role: 'user', content: 'What is this document about?' }],
    maxTokens: MIN_MAX_TOKENS,
    documentText: '[Page 1]\nSettlement agreement between Acme and Beta.',
    contextLabel: 'the whole document, pages 1-1',
    ...overrides,
  };
}

function serviceFor(
  recorder: Recorder,
  tools?: CenturionToolHooks
): { service: CenturionService; chunks: AiChunk[] } {
  let counter = 0;
  const service = new CenturionService({
    apiKey: 'sk-ant-not-a-real-key',
    createClient: () => recorder.client,
    newRequestId: () => `req-${++counter}`,
    ...(tools === undefined ? {} : { tools }),
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
    expect(failure.message).toBe(CENTURION_MESSAGES.RATE_LIMIT);
  });

  it('surfaces a transport failure through ask as NETWORK', async () => {
    const recorder = fakeClient([], new APIConnectionError({ message: 'ENOTFOUND' }));
    const { service, chunks } = serviceFor(recorder);

    await expect(service.ask(payload(), (chunk) => chunks.push(chunk))).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(chunks.at(-1)?.done).toBe(true);
  });

  // An Error crossing IPC keeps only its message, so the code travels on the
  // terminal chunk instead of in a prefix the renderer has to parse back out.
  it('closes the stream with the taxonomy code on every failure', async () => {
    const recorder = fakeClient([], new APIConnectionError({ message: 'ENOTFOUND' }));
    const { service, chunks } = serviceFor(recorder);

    await expect(service.ask(payload(), (chunk) => chunks.push(chunk))).rejects.toThrow();

    // Under the id of the attempt that failed, so the panel discards its text.
    expect(chunks.at(-1)).toEqual({ requestId: 'req-1', text: '', done: true, code: 'NETWORK' });
  });

  it('leaves the code off the terminal chunk of a successful ask', async () => {
    const recorder = fakeClient([{ deltas: ['Done.'], stopReason: 'end_turn' }]);
    const { service, chunks } = serviceFor(recorder);

    await service.ask(payload(), (chunk) => chunks.push(chunk));

    expect(chunks.at(-1)?.code).toBeUndefined();
  });
});

describe('request guards', () => {
  it('refuses to ask about a document whose text never arrived', async () => {
    for (const documentText of ['', '   ']) {
      const recorder = fakeClient([{ deltas: ['ok'], stopReason: 'end_turn' }]);
      const { service, chunks } = serviceFor(recorder);

      await expect(
        service.ask(payload({ documentText }), (chunk) => chunks.push(chunk))
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      // Refused before a single token was spent.
      expect(recorder.params).toHaveLength(0);
      expect(chunks.at(-1)).toMatchObject({ done: true, code: 'BAD_REQUEST' });
    }
  });

  it('refuses a conversation that does not start with the attorney', async () => {
    const recorder = fakeClient([{ deltas: ['ok'], stopReason: 'end_turn' }]);
    const { service } = serviceFor(recorder);

    await expect(
      service.ask(payload({ messages: [{ role: 'assistant', content: 'hello' }] }), () => undefined)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(recorder.params).toHaveLength(0);
  });

  it('keeps the ceiling generous no matter what the panel asked for', () => {
    expect(clampCeiling(10)).toBe(MIN_MAX_TOKENS);
    expect(clampCeiling(Number.NaN)).toBe(MIN_MAX_TOKENS);
    expect(clampCeiling(1_000_000)).toBe(128_000);
    expect(clampCeiling(20_000)).toBe(20_000);
  });
});

/* ── tool use ─────────────────────────────────────────────────────────── */

const BATES_INPUT = {
  prefix: 'PLAINTIFF',
  startNumber: 1,
  padWidth: 6,
  position: 'bottom-right',
};

const BATES_USE: FakeToolUse = { id: 'toolu_1', name: 'applyBates', input: BATES_INPUT };

interface HookSpy {
  hooks: CenturionToolHooks;
  executed: CenturionToolCall[];
  confirmed: string[];
}

function fakeHooks(
  decision: CenturionToolDecision = 'approved',
  execute?: (call: CenturionToolCall) => Promise<string>
): HookSpy {
  const executed: CenturionToolCall[] = [];
  const confirmed: string[] = [];
  return {
    executed,
    confirmed,
    hooks: {
      summarize: () => 'Stamp PLAINTIFF000001 to PLAINTIFF000004 on all 4 pages, bottom right.',
      confirm: (_requestId, toolUseId) => {
        confirmed.push(toolUseId);
        return Promise.resolve(decision);
      },
      execute: (call) => {
        executed.push(call);
        return execute === undefined ? Promise.resolve('Done - 4 pages stamped.') : execute(call);
      },
    },
  };
}

/** A run that proposes one Bates call, then answers once the tool has settled. */
function toolRun(): FakeAttempt[] {
  return [
    { deltas: ['I will stamp them. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
    { deltas: ['Stamped PLAINTIFF000001 to PLAINTIFF000004 (p. 1-4).'], stopReason: 'end_turn' },
  ];
}

function proposals(chunks: AiChunk[]): AiChunk[] {
  return chunks.filter((chunk) => chunk.proposal !== undefined);
}

function toolResults(recorder: Recorder): unknown[] {
  const sent = recorder.params.at(-1);
  const last = sent?.messages.at(-1);
  return Array.isArray(last?.content) ? last.content : [];
}

describe('offering the tools', () => {
  it('sends the schemas and the acting rules only when tools are switched on', async () => {
    const recorder = fakeClient([{ deltas: ['ok'], stopReason: 'end_turn' }]);
    const spy = fakeHooks();
    const { service } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), () => undefined);

    const sent = recorder.params[0] as Anthropic.MessageStreamParams;
    expect(sent.tools?.map((tool) => tool.name)).toEqual([
      'applyBates',
      'applyWatermark',
      'applyExhibitStamp',
      'applyPageNumbers',
      'setBookmarks',
      'suggestRedactions',
      'addSignatureFields',
    ]);
    expect(String(sent.system)).toContain('confirm card');
    expect(String(sent.system)).toContain('Cite the page for every fact');
  });

  it('offers nothing when the attorney has the switch off', async () => {
    const recorder = fakeClient([{ deltas: ['ok'], stopReason: 'end_turn' }]);
    const { service } = serviceFor(recorder, fakeHooks().hooks);

    await service.ask(payload({ toolsEnabled: false }), () => undefined);

    const sent = recorder.params[0] as Anthropic.MessageStreamParams;
    expect(sent.tools).toBeUndefined();
    expect(String(sent.system)).not.toContain('confirm card');
  });
});

describe('a tool call the attorney approves', () => {
  it('proposes, waits, runs, and reports the receipt back to the model', async () => {
    const recorder = fakeClient(toolRun());
    const spy = fakeHooks('approved');
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    const result = await service.ask(payload({ toolsEnabled: true }), (chunk) =>
      chunks.push(chunk)
    );

    // The card, then the same card settled.
    const [proposed, settledChunk] = proposals(chunks);
    expect(proposed?.proposal).toMatchObject({
      toolUseId: 'toolu_1',
      name: 'applyBates',
      summary: 'Stamp PLAINTIFF000001 to PLAINTIFF000004 on all 4 pages, bottom right.',
      input: BATES_INPUT,
    });
    expect(proposed?.proposal?.result).toBeUndefined();
    expect(settledChunk?.proposal?.result).toEqual({
      outcome: 'done',
      message: 'Done - 4 pages stamped.',
    });

    expect(spy.confirmed).toEqual(['toolu_1']);
    expect(spy.executed).toEqual([{ name: 'applyBates', input: BATES_INPUT }]);
    expect(toolResults(recorder)).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_1',
        content: 'Done - 4 pages stamped.',
        is_error: false,
      },
    ]);
    // One answer, both turns of it, under one request id.
    expect(result.text).toBe(
      'I will stamp them.\n\nStamped PLAINTIFF000001 to PLAINTIFF000004 (p. 1-4).'
    );
    expect(result.stopReason).toBe('end_turn');
    expect(new Set(chunks.map((chunk) => chunk.requestId))).toEqual(new Set(['req-1']));
  });

  it('carries the assistant turn and the result back into the conversation', async () => {
    const recorder = fakeClient(toolRun());
    const { service } = serviceFor(recorder, fakeHooks().hooks);

    await service.ask(payload({ toolsEnabled: true }), () => undefined);

    expect(recorder.params).toHaveLength(2);
    const second = recorder.params[1] as Anthropic.MessageStreamParams;
    const assistant = second.messages.at(-2);
    expect(assistant?.role).toBe('assistant');
    // The whole block list goes back, tool_use and any thinking blocks with it.
    expect(Array.isArray(assistant?.content)).toBe(true);
    expect(second.messages.at(-1)?.role).toBe('user');
  });

  it('runs several calls in a row, one card at a time', async () => {
    const recorder = fakeClient([
      { deltas: ['First. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
      {
        deltas: ['Second. '],
        stopReason: 'tool_use',
        toolUses: [
          {
            id: 'toolu_2',
            name: 'applyWatermark',
            input: { text: 'CONFIDENTIAL', orientation: 'diagonal', opacityPct: 25 },
          },
        ],
      },
      { deltas: ['Both done.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks('approved');
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk));

    expect(spy.confirmed).toEqual(['toolu_1', 'toolu_2']);
    expect(spy.executed.map((call) => call.name)).toEqual(['applyBates', 'applyWatermark']);
    expect(proposals(chunks)).toHaveLength(4);
  });
});

describe('a tool call the attorney does not approve', () => {
  it('tells the model it was declined and never runs anything', async () => {
    const recorder = fakeClient([
      { deltas: ['Proposing. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
      { deltas: ['Understood - nothing was changed.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks({ verdict: 'rejected', detail: 'Skipped.' });
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk));

    expect(spy.executed).toEqual([]);
    expect(toolResults(recorder)).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: DECLINED_RESULT, is_error: false },
    ]);
    expect(proposals(chunks).at(-1)?.proposal?.result).toEqual({
      outcome: 'skipped',
      message: 'Skipped.',
    });
  });

  // Silence is a refusal, and the card says so rather than reading as a failure.
  it('treats an unanswered card as a skip, with the reason on the card', async () => {
    const recorder = fakeClient([
      { deltas: ['Proposing. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
      { deltas: ['No answer, so nothing was changed.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks({
      verdict: 'rejected',
      detail: 'No answer after five minutes - skipped.',
    });
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk));

    expect(spy.executed).toEqual([]);
    expect(proposals(chunks).at(-1)?.proposal?.result).toEqual({
      outcome: 'skipped',
      message: 'No answer after five minutes - skipped.',
    });
  });
});

describe('tool calls that cannot be trusted or cannot be run', () => {
  it('refuses input that does not validate, without ever showing a card', async () => {
    const recorder = fakeClient([
      {
        deltas: ['Trying. '],
        stopReason: 'tool_use',
        toolUses: [{ id: 'toolu_1', name: 'applyBates', input: { prefix: 'X', startNumber: -4 } }],
      },
      { deltas: ['Sorry - let me correct that.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks();
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk));

    expect(proposals(chunks)).toEqual([]);
    expect(spy.confirmed).toEqual([]);
    expect(spy.executed).toEqual([]);
    const [result] = toolResults(recorder) as { content: string; is_error: boolean }[];
    expect(result?.is_error).toBe(true);
    expect(result?.content).toMatch(/"startNumber"/);
  });

  it('refuses a tool that was never offered', async () => {
    const recorder = fakeClient([
      {
        deltas: [''],
        stopReason: 'tool_use',
        toolUses: [{ id: 'toolu_1', name: 'deleteEverything', input: {} }],
      },
      { deltas: ['Understood.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks();
    const { service } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), () => undefined);

    const [result] = toolResults(recorder) as { content: string; is_error: boolean }[];
    expect(result?.is_error).toBe(true);
    expect(result?.content).toMatch(/no tool called "deleteEverything"/);
    expect(spy.executed).toEqual([]);
  });

  it('reports a failed run on the card and to the model, and keeps talking', async () => {
    const recorder = fakeClient([
      { deltas: ['Stamping. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
      { deltas: ['That did not work - the document ends at page 4.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks('approved', () =>
      Promise.reject(new Error('This document ends at page 4, so page 99 does not exist.'))
    );
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    const result = await service.ask(payload({ toolsEnabled: true }), (chunk) =>
      chunks.push(chunk)
    );

    expect(proposals(chunks).at(-1)?.proposal?.result).toEqual({
      outcome: 'failed',
      message: 'This document ends at page 4, so page 99 does not exist.',
    });
    const [toolResultBlock] = toolResults(recorder) as { content: string; is_error: boolean }[];
    expect(toolResultBlock?.is_error).toBe(true);
    expect(toolResultBlock?.content).toContain('ends at page 4');
    expect(result.stopReason).toBe('end_turn');
  });

  it('never runs redaction in main - the renderer receipt is the result', async () => {
    const recorder = fakeClient([
      {
        deltas: ['Here is what I would redact. '],
        stopReason: 'tool_use',
        toolUses: [
          {
            id: 'toolu_1',
            name: 'suggestRedactions',
            input: { terms: [{ text: '123-45-6789', reason: 'Social security number' }] },
          },
        ],
      },
      { deltas: ['Marked for your review.'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks({
      verdict: 'approved',
      detail: 'Marked 12 instances of 1 term. Nothing has been destroyed.',
    });
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    await service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk));

    expect(spy.executed).toEqual([]);
    const [result] = toolResults(recorder) as { content: string; is_error: boolean }[];
    expect(result?.content).toContain('Marked 12 instances');
    expect(result?.is_error).toBe(false);
    expect(proposals(chunks).at(-1)?.proposal?.result).toMatchObject({ outcome: 'done' });
  });

  it('stops a model that keeps proposing without ever finishing', async () => {
    const rounds = Array.from({ length: MAX_TOOL_TURNS + 1 }, () => ({
      deltas: ['again '],
      stopReason: 'tool_use' as const,
      toolUses: [BATES_USE],
    }));
    const recorder = fakeClient(rounds);
    const { service } = serviceFor(recorder, fakeHooks().hooks);

    await expect(service.ask(payload({ toolsEnabled: true }), () => undefined)).rejects.toThrow(
      /one step at a time/
    );
    expect(recorder.params).toHaveLength(MAX_TOOL_TURNS);
  });
});

describe('the clipped-answer rule with tools in play', () => {
  it('still discards a clipped tool turn and retries with more room', async () => {
    const recorder = fakeClient([
      { deltas: ['I will stamp '], stopReason: 'max_tokens' },
      { deltas: ['Stamping. '], stopReason: 'tool_use', toolUses: [BATES_USE] },
      { deltas: ['Done (p. 1-4).'], stopReason: 'end_turn' },
    ]);
    const spy = fakeHooks('approved');
    const { service, chunks } = serviceFor(recorder, spy.hooks);

    const result = await service.ask(payload({ toolsEnabled: true }), (chunk) =>
      chunks.push(chunk)
    );

    expect(recorder.params[0]?.max_tokens).toBe(MIN_MAX_TOKENS);
    expect(recorder.params[1]?.max_tokens).toBe(MIN_MAX_TOKENS * RETRY_MULTIPLIER);
    // The retry streams under its own id, so the panel drops the clipped half.
    expect(result.requestId).toBe('req-2');
    expect(result.text).toBe('Stamping.\n\nDone (p. 1-4).');
    expect(proposals(chunks).every((chunk) => chunk.requestId === 'req-2')).toBe(true);
    expect(chunks.filter((chunk) => chunk.done)).toHaveLength(1);
  });

  it('hard-fails rather than showing an answer clipped on a tool turn', async () => {
    const recorder = fakeClient([
      { deltas: ['half '], stopReason: 'max_tokens' },
      { deltas: ['still half '], stopReason: 'max_tokens' },
    ]);
    const { service, chunks } = serviceFor(recorder, fakeHooks().hooks);

    await expect(
      service.ask(payload({ toolsEnabled: true }), (chunk) => chunks.push(chunk))
    ).rejects.toMatchObject({ code: 'CLIPPED' });
  });
});

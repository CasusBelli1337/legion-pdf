/**
 * Centurion's Anthropic client. Streams an answer about the open document and
 * enforces engineering rule 3: every response's `stop_reason` is inspected, and
 * a `max_tokens` stop is a FAILURE - retried once at four times the ceiling, and
 * then surfaced as an error. A clipped answer is never returned or displayed as
 * if it were complete.
 *
 * The API key arrives as a constructor argument from the keystore and is never
 * logged, echoed into an error, or written anywhere.
 */

import { randomUUID } from 'node:crypto';
import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type {
  AiAskRequest,
  AiAskResult,
  AiChunk,
  AiMessage,
  CenturionErrorCode,
} from '@shared/types';

/** Verified against the claude-api skill: the current Opus, no date suffix. */
export const CENTURION_MODEL = 'claude-opus-5';

/** Generous by design - the ceiling is free until it is actually used. */
export const MIN_MAX_TOKENS = 8192;

/** The model's hard output ceiling; the retry can never ask for more. */
export const MAX_MAX_TOKENS = 128_000;

/** How much extra room the single automatic retry gets. */
export const RETRY_MULTIPLIER = 4;

/** One plain-English sentence per failure, written for an attorney, not a developer. */
export const CENTURION_MESSAGES: Record<CenturionErrorCode, string> = {
  NO_KEY:
    'No API key yet. Add your Anthropic key in the Centurion panel to start asking questions.',
  BAD_KEY: 'That API key was rejected. Check it in the Centurion panel, then try again.',
  RATE_LIMIT: 'Anthropic is throttling this key right now. Wait about a minute and ask again.',
  NETWORK: "Could not reach Anthropic. Check this computer's internet connection and try again.",
  CONTEXT_TOO_LONG:
    'This document is too large to send in one go. Switch the context to a page range and ask about that instead.',
  BUSY: 'Anthropic is busy at the moment. Try the same question again in a minute.',
  CLIPPED:
    'The answer was cut off twice, even with extra room. Nothing is shown because a half answer is worse than none - ask a narrower question, or narrow the context to a page range.',
  DECLINED: 'Claude declined to answer this one. Rephrase the question and try again.',
  BAD_REQUEST: 'Centurion could not send that request. Start a new conversation and try again.',
  UNKNOWN: 'Centurion hit an unexpected problem. Try again; if it repeats, restart Librarius.',
};

export class CenturionError extends Error {
  constructor(
    readonly code: CenturionErrorCode,
    message: string = CENTURION_MESSAGES[code]
  ) {
    super(message);
    this.name = 'CenturionError';
  }
}

/**
 * A request that carries no document text would have Claude answering from
 * nothing at all, which reads exactly like a real answer - so it is refused
 * before a single token is spent.
 */
function assertAskable(request: AiAskRequest): void {
  if (request.documentText.trim() === '') {
    throw new CenturionError(
      'BAD_REQUEST',
      'Centurion received no document text to read. Reopen the document and try again.'
    );
  }
  if (request.messages[0]?.role !== 'user') throw new CenturionError('BAD_REQUEST');
}

const SYSTEM_PROMPT = [
  'You are Centurion, the document assistant inside Legion Armory - Librarius, a PDF workbench',
  'used by a litigation attorney.',
  '',
  'You are given the text of the PDF the attorney has open, inside <document> tags. Each page',
  'starts with a [Page N] marker.',
  '',
  'How to answer:',
  '- Answer only from the document text you were given. If it does not say, say so plainly and',
  '  stop. Never fill the gap from general knowledge or from what a document like this usually says.',
  '- Cite the page for every fact you report, like this: (p. 14). Cite a range when a fact spans pages.',
  '- Write plain English for a practising attorney. Lead with the answer, then the support. No',
  '  preamble, no restating the question, no closing offers of further help.',
  '- Quote exactly when the wording matters; never paraphrase inside quotation marks.',
  '- The text comes from a PDF and sometimes from OCR. If a passage is garbled or a page is blank,',
  '  name the page and move on rather than guessing at what it said.',
  '- You are reading the document, not advising on it. Give a legal opinion only if asked for one.',
].join('\n');

function documentBlock(payload: AiAskRequest): Anthropic.TextBlockParam {
  return {
    type: 'text',
    text: `<document context="${payload.contextLabel}">\n${payload.documentText}\n</document>`,
    // The document is the stable prefix of every turn in this conversation;
    // the varying question sits after it, so the cache actually gets read.
    cache_control: { type: 'ephemeral' },
  };
}

function buildMessages(payload: AiAskRequest): Anthropic.MessageParam[] {
  const [first, ...rest] = payload.messages;
  if (first === undefined) throw new CenturionError('BAD_REQUEST');
  const head: Anthropic.MessageParam = {
    role: 'user',
    content: [documentBlock(payload), { type: 'text', text: first.content }],
  };
  return [head, ...rest.map((turn: AiMessage) => ({ role: turn.role, content: turn.content }))];
}

/** Clamp a requested ceiling into [MIN_MAX_TOKENS, MAX_MAX_TOKENS]. */
export function clampCeiling(requested: number): number {
  if (!Number.isFinite(requested)) return MIN_MAX_TOKENS;
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.trunc(requested)));
}

/** Maps an SDK failure onto the taxonomy. Typed classes first, status as backstop. */
export function classifyError(error: unknown): CenturionError {
  if (error instanceof CenturionError) return error;
  if (error instanceof APIConnectionError) return new CenturionError('NETWORK');
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new CenturionError('BAD_KEY');
  }
  if (error instanceof RateLimitError) return new CenturionError('RATE_LIMIT');
  if (error instanceof BadRequestError) return classifyBadRequest(error);
  return classifyByStatus(error);
}

/** Prefer the API's own `error.message` over the SDK's `"400 {json}"` summary. */
function bodyMessage(error: APIError): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const reported = body?.error?.message;
  return typeof reported === 'string' ? reported : error.message;
}

/** A 400 is "too long" only when the API says so; everything else is a real bug. */
function classifyBadRequest(error: BadRequestError): CenturionError {
  const text = bodyMessage(error).toLowerCase();
  const tooLong = text.includes('too long') || text.includes('context') || text.includes('token');
  return new CenturionError(tooLong ? 'CONTEXT_TOO_LONG' : 'BAD_REQUEST');
}

function classifyByStatus(error: unknown): CenturionError {
  const status = error instanceof APIError ? error.status : undefined;
  if (typeof status !== 'number') return new CenturionError('UNKNOWN');
  if (status === 401 || status === 403) return new CenturionError('BAD_KEY');
  if (status === 429) return new CenturionError('RATE_LIMIT');
  if (status === 413) return new CenturionError('CONTEXT_TOO_LONG');
  if (status >= 500) return new CenturionError('BUSY');
  return new CenturionError('UNKNOWN');
}

/** The slice of the SDK stream this service uses; keeps the service fake-able. */
export interface CenturionStream {
  on(event: 'text', listener: (delta: string, snapshot: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
}

export interface CenturionClient {
  messages: { stream(params: Anthropic.MessageStreamParams): CenturionStream };
}

export interface CenturionServiceOptions {
  apiKey: string;
  /** Injected in tests; production builds a real SDK client. */
  createClient?: (apiKey: string) => CenturionClient;
  /** Injected in tests so attempt ids are predictable. */
  newRequestId?: () => string;
}

function defaultClient(apiKey: string): CenturionClient {
  return new Anthropic({ apiKey });
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export class CenturionService {
  private readonly client: CenturionClient;
  private readonly newRequestId: () => string;

  constructor(options: CenturionServiceOptions) {
    this.client = (options.createClient ?? defaultClient)(options.apiKey);
    this.newRequestId = options.newRequestId ?? randomUUID;
  }

  /**
   * Ask, streaming deltas out through `onChunk`. Each attempt streams under its
   * OWN requestId, so a retry after a clipped answer tells the panel to discard
   * the partial text rather than append to it.
   */
  async ask(payload: AiAskRequest, onChunk: (chunk: AiChunk) => void): Promise<AiAskResult> {
    let lastRequestId = '';
    const sink = (chunk: AiChunk): void => {
      lastRequestId = chunk.requestId;
      onChunk(chunk);
    };
    try {
      assertAskable(payload);
      const result = await this.run(payload, sink);
      onChunk({ requestId: result.requestId, text: '', done: true });
      return result;
    } catch (error) {
      // The taxonomy code rides on the terminal chunk: an Error crossing IPC
      // arrives as a bare message string, and a code parsed back out of English
      // is a protocol waiting to drift.
      const failure = classifyError(error);
      onChunk({ requestId: lastRequestId, text: '', done: true, code: failure.code });
      throw failure;
    }
  }

  /** One attempt, then at most one retry at RETRY_MULTIPLIER times the ceiling. */
  private async run(
    payload: AiAskRequest,
    onChunk: (chunk: AiChunk) => void
  ): Promise<AiAskResult> {
    const ceiling = clampCeiling(payload.maxTokens);
    const first = await this.attempt(payload, ceiling, onChunk);
    if (first.stopReason !== 'max_tokens') return first;

    const retryCeiling = clampCeiling(ceiling * RETRY_MULTIPLIER);
    if (retryCeiling <= ceiling) throw new CenturionError('CLIPPED');
    const retry = await this.attempt(payload, retryCeiling, onChunk);
    if (retry.stopReason === 'max_tokens') throw new CenturionError('CLIPPED');
    return retry;
  }

  private async attempt(
    payload: AiAskRequest,
    maxTokens: number,
    onChunk: (chunk: AiChunk) => void
  ): Promise<AiAskResult> {
    const requestId = this.newRequestId();
    // An opening empty delta binds the panel to this attempt immediately, so the
    // typing indicator moves before the first token lands.
    onChunk({ requestId, text: '', done: false });

    const stream = this.client.messages.stream({
      model: CENTURION_MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      messages: buildMessages(payload),
    });
    stream.on('text', (delta: string) => onChunk({ requestId, text: delta, done: false }));

    const message = await stream.finalMessage();
    const stopReason = message.stop_reason ?? 'end_turn';
    if (stopReason === 'refusal') throw new CenturionError('DECLINED');
    if (stopReason === 'model_context_window_exceeded') {
      throw new CenturionError('CONTEXT_TOO_LONG');
    }
    return {
      requestId,
      text: textOf(message),
      stopReason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}

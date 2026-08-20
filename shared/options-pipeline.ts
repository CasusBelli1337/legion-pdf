/**
 * Option and detail shapes for the pipeline lanes: OCR, redaction, Centurion
 * (Anthropic), and renderer rasterization.
 * Types only — re-exported type-only from @shared/types.
 */

import type { CenturionToolProposal } from './centurion-tools';
import type { PdfRect, TextMatch } from './types';

/* ── ocr: local Tesseract (lane D) ────────────────────────────────────── */

export interface OcrOptions {
  pages: number[];
  /** Tesseract language code; only "eng" ships bundled. */
  language: string;
  /** Rasterization DPI fed to Tesseract. */
  dpi: number;
  /** Worker count; defaults to CPU core count. */
  workers?: number;
}

/** Which pages already carry a text layer and which need OCR. */
export interface OcrDetectResult {
  pageCount: number;
  pagesWithText: number[];
  pagesNeedingOcr: number[];
}

export interface OcrRunDetail {
  pagesOcred: number[];
  /** Characters of text written per page, in pagesOcred order. */
  charsPerPage: number[];
  /** Words recognized per page, in pagesOcred order. */
  wordsPerPage: number[];
}

/**
 * One file's outcome in a bulk run. `outputPath` is null on anything but a
 * clean 'done' — a failed or cancelled file writes nothing, and reporting a
 * path for it would invite the caller to open a document that is not there.
 */
export interface BulkOcrFileResult {
  /** Absolute path of the input file. */
  path: string;
  /** Absolute path of the searchable output, or null when nothing was written. */
  outputPath: string | null;
  /** Pages OCR'd in this file. */
  pages: number;
  /** Words recognized across those pages — the count that proves real output. */
  words: number;
  status: 'done' | 'failed' | 'cancelled';
  /** Plain-English reason, present only on 'failed'. */
  error?: string;
}

/**
 * The receipt for a whole bulk run. `files` carries one entry per INPUT path,
 * in request order, so a caller can prove nothing was silently skipped;
 * succeeded + failed count only what finished either way.
 */
export interface BulkOcrResult {
  files: BulkOcrFileResult[];
  succeeded: number;
  failed: number;
}

export interface BulkOcrOptions {
  /** Where the searchable copies land; omit to write beside each input. */
  outputDir?: string;
  /** Overwrite an existing output file rather than refusing that file. */
  overwrite: boolean;
}

/* ── redact: true destruction (lane E) ────────────────────────────────── */

/** A marked region awaiting destruction. Marked state is reversible; apply is not. */
export interface RedactionBox {
  id: string;
  page: number;
  rect: PdfRect;
  /** Set when the box came from a search hit rather than a hand-drawn box. */
  sourceMatch?: TextMatch;
}

export interface RedactSearchRequest {
  query: string;
  /** Treat `query` as a regular expression rather than a literal. */
  regex: boolean;
  caseSensitive: boolean;
}

export interface RedactApplyOptions {
  boxes: RedactionBox[];
  /** Rasterization DPI for affected pages; 300 is the production default. */
  dpi: number;
  /** Re-OCR the rebuilt pages so non-redacted content stays searchable. */
  reOcr: boolean;
  /** Strings the verify pass must prove absent from the output bytes. */
  verifyStrings: string[];
}

/**
 * One marked term's accounting — the numbers behind an honest receipt.
 *
 * Redaction destroys what was MARKED. A term the attorney marked once in a
 * document that holds it five times leaves four copies standing, and that is
 * the correct outcome, not a failure. Carrying the counts here is what lets the
 * receipt say so out loud instead of implying the whole term is gone.
 */
export interface RedactedTerm {
  /** The term as the attorney marked it. */
  text: string;
  /** Occurrences the source document held, counted over every encoding. */
  before: number;
  /** Occurrences still readable in the redacted document. */
  remaining: number;
  /** How many of those occurrences the attorney marked for destruction. */
  marked: number;
}

/** The receipt: proof the MARKED copies no longer exist in the output. */
export interface RedactVerifyResult {
  verified: boolean;
  pagesRebuilt: number[];
  instancesDestroyed: number;
  /** Terms whose marked copies did NOT all disappear — never a success. */
  survivingStrings: string[];
  /** Per-term accounting: what was there, what was marked, what is left. */
  terms: RedactedTerm[];
  /** Doc-store id of the adopted redacted document (always a NEW document). */
  docId?: string;
  /** Rebuilt pages that still draw text — a distinct failure from survivingStrings. */
  pagesStillCarryingText?: number[];
}

/* ── ai: Centurion (lane F) ───────────────────────────────────────────── */

export interface AiKeyStatus {
  /** The renderer never sees the key itself — only whether one exists. */
  hasKey: boolean;
}

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiAskRequest {
  docId: string;
  /** Conversation so far, oldest first. */
  messages: AiMessage[];
  /** Restrict document context to these pages; omit to send the whole document. */
  contextPages?: number[];
  /** Generous by design — a max_tokens stop is a failure, not a result. */
  maxTokens: number;
  /** Page-labelled document text extracted in the renderer. Never empty. */
  documentText: string;
  /** Plain English for the prompt, e.g. "pages 1-20 of 312". */
  contextLabel: string;
  /** Offer Centurion the document tools; omit or false for answers only. */
  toolsEnabled?: boolean;
}

/**
 * Centurion's failure taxonomy. Main classifies every failure into one of these
 * and sends it on the terminal `ai:chunk`; the panel drives its state off the
 * code and shows the sentence that came with it.
 */
export type CenturionErrorCode =
  | 'NO_KEY'
  | 'BAD_KEY'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'CONTEXT_TOO_LONG'
  | 'BUSY'
  | 'CLIPPED'
  | 'DECLINED'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

/** One streamed delta on `ai:chunk`. */
export interface AiChunk {
  requestId: string;
  text: string;
  done: boolean;
  /** Set only on the terminal chunk of a FAILED ask; absent on every success. */
  code?: CenturionErrorCode;
  /**
   * A tool call awaiting the attorney's answer. The panel shows the confirm card
   * and replies on `ai:toolDecision`; nothing runs until it does.
   */
  proposal?: CenturionToolProposal;
}

export interface AiAskResult {
  requestId: string;
  text: string;
  /** Anthropic stop reason; "max_tokens" must be treated as a failure. */
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

/* ── raster: renderer-side page rasterization (foundation) ────────────── */

export interface RasterRequest {
  requestId: string;
  docId: string;
  page: number;
  dpi: number;
}

export interface RasterResponse {
  requestId: string;
  /** PNG bytes, or null when `error` is set. */
  png: Uint8Array | null;
  widthPx: number;
  heightPx: number;
  error?: string;
}

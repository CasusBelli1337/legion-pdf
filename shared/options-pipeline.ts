/**
 * Option and detail shapes for the pipeline lanes: OCR, redaction, Centurion
 * (Anthropic), and renderer rasterization.
 * Types only — re-exported type-only from @shared/types.
 */

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

/** The receipt: proof the marked strings no longer exist in the output. */
export interface RedactVerifyResult {
  verified: boolean;
  pagesRebuilt: number[];
  instancesDestroyed: number;
  /** Non-empty means the redaction FAILED — never present this as success. */
  survivingStrings: string[];
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
}

/** One streamed delta on `ai:chunk`. */
export interface AiChunk {
  requestId: string;
  text: string;
  done: boolean;
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

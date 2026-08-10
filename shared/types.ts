/**
 * Core contracts shared by all four zones (shared / core / electron / src).
 * Per-feature tool option shapes live in ./tool-options and are re-exported
 * here so every zone has a single import point: `@shared/types`.
 */

export type * from './tool-options';

/** A point in PDF user space: origin bottom-left, units are points (1/72"). */
export interface PdfPoint {
  x: number;
  y: number;
}

/** A rectangle in PDF user space, anchored at its bottom-left corner. */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Page dimensions in PDF points. */
export interface PageSize {
  width: number;
  height: number;
}

/** Where a stamp sits on the page. */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Horizontal placement for headers/footers that span the page. */
export type Alignment = 'left' | 'center' | 'right';

/** A human-entered page range such as "1-30, 45, 60-62". Parsed in core/. */
export type PageRangeSpec = string;

/**
 * One open document tab. The main process byte store is the source of truth;
 * the renderer holds a structured-clone copy of `bytes` for pdfjs.
 */
export interface DocumentSession {
  /** uuid, assigned by the main-process doc store. */
  id: string;
  /** null = never saved (e.g. a fresh combine result). */
  filePath: string | null;
  /** Basename for tab labels and the status footer. */
  fileName: string;
  /** CURRENT working copy, post-ops, possibly unsaved. Never empty. */
  bytes: Uint8Array;
  pageCount: number;
  dirty: boolean;
}

/** Session metadata without the bytes — for lists, recents, and logging. */
export type DocumentSummary = Omit<DocumentSession, 'bytes'>;

/**
 * Every core/ function returns this. Callers MUST assert the pagesIn/pagesOut
 * relation they expect; a silently-empty result is a bug, never a result.
 */
export interface OpResult<T = undefined> {
  /** Output PDF bytes. MUST be non-empty. */
  bytes: Uint8Array;
  pagesIn: number;
  /** Caller asserts the expected relation to pagesIn. */
  pagesOut: number;
  /** Op-specific evidence, e.g. `{ batesApplied: string[] }`. */
  detail: T;
}

/** Thrown when a page range validates to zero pages against the real document. */
export class RangeCollapseError extends Error {
  readonly code = 'RANGE_COLLAPSE';
  constructor(
    readonly requested: string,
    readonly pageCount: number
  ) {
    super(`Page range "${requested}" selects no pages in a ${pageCount}-page document.`);
    this.name = 'RangeCollapseError';
  }
}

/** Errors do not survive IPC as classes; main serializes them into this. */
export interface SerializedError {
  name: string;
  message: string;
  code?: string;
}

/** True when an unknown value is a RangeCollapseError or its serialized twin. */
export function isRangeCollapseError(value: unknown): boolean {
  return (
    value instanceof RangeCollapseError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { code?: unknown }).code === 'RANGE_COLLAPSE')
  );
}

/** Streamed by every long-running op on `<group>:progress`. UI shows "Page 37/214". */
export interface ProgressEvent {
  docId: string;
  /** Plain-English phase label, e.g. "Reading pages" or "Burning redactions". */
  phase: string;
  current: number;
  total: number;
  message?: string;
}

/** One hit from ViewerApi.findText / search-based redaction. */
export interface TextMatch {
  /** 1-based page number. */
  page: number;
  text: string;
  /** Ordinal of this match within the whole document. */
  index: number;
  /** Highlight boxes in PDF user space. */
  quads: PdfRect[];
}

/** An entry in the recent-files list persisted to userData. */
export interface RecentFile {
  filePath: string;
  fileName: string;
  /** ISO 8601 timestamp of the most recent open. */
  openedAt: string;
}

/** Result of writing a document to disk. */
export interface SaveResult {
  filePath: string;
  byteLength: number;
  savedAt: string;
}

/** Answer to `app:version` — shown in Help > About and the status footer. */
export interface AppVersionInfo {
  app: string;
  electron: string;
  chrome: string;
  node: string;
}

/** Menu actions the main process forwards to the renderer over `app:menu`. */
export type MenuAction =
  'open' | 'save' | 'saveAs' | 'print' | 'zoomIn' | 'zoomOut' | 'zoomReset' | 'about';

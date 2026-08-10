/**
 * Option and detail shapes for the assembly lane (core/ops/**): merge, split,
 * reorder, rotate, delete, extract, insert, bookmarks, scrub, flatten.
 * Types only — re-exported type-only from @shared/types.
 */

import type { PageRangeSpec } from './types';

/* ── ops: assembly and page organization (lane B) ─────────────────────── */

/** One input to a merge, in the order the user arranged it. */
export interface MergeSource {
  /** Doc already in the store, or an absolute path to read from disk. */
  docId?: string;
  filePath?: string;
}

export interface MergeOptions {
  sources: MergeSource[];
  /** Keep each source's outline as a top-level bookmark named after the file. */
  preserveBookmarks: boolean;
}

/** What core/ops/merge reports: how many pages each source contributed. */
export interface MergePagesDetail {
  perSourcePages: number[];
}

/**
 * What `ops:merge` returns. Merge builds a WHOLE NEW document, so the main
 * process adopts the bytes into the store and reports the id the renderer opens
 * in a fresh tab.
 */
export interface MergeDetail extends MergePagesDetail {
  /** Store id of the new combined document. */
  docId: string;
}

export interface SplitOptions {
  /** Ranges such as "1-30, 31-60"; each range becomes one output document. */
  ranges: PageRangeSpec[];
}

/** What core/ops/split reports: one byte array per requested range, in order. */
export interface SplitPartsDetail {
  parts: Uint8Array[];
  partPageCounts: number[];
}

/**
 * What `ops:split` returns. The parts are adopted into the store in the main
 * process, so only their ids cross IPC — the bytes never travel twice.
 */
export interface SplitDetail {
  /** Store id per requested range, in request order. */
  partDocIds: string[];
  partPageCounts: number[];
}

export interface ReorderOptions {
  /** Complete 1-based permutation of the document's pages. */
  order: number[];
}

export type RotationDegrees = 90 | 180 | 270;

export interface RotateOptions {
  pages: number[];
  /** Clockwise degrees added to each page's existing rotation. */
  degrees: RotationDegrees;
}

export interface DeletePagesOptions {
  pages: number[];
}

export interface ExtractOptions {
  pages: number[];
  /** Also delete the extracted pages from the source document. */
  removeFromSource: boolean;
}

/**
 * What core/ops/extract reports. `bytes` on the OpResult is the EXTRACTED
 * document; the source rides along here so the caller can swap the store's copy
 * in one step. It is the unchanged input unless `removeFromSource` was set, in
 * which case it is the source REBUILT without the extracted pages.
 */
export interface ExtractPagesDetail {
  sourceBytes: Uint8Array;
  sourcePageCount: number;
  /** 1-based pages that were pulled out, in document order. */
  extractedPages: number[];
}

/** What `ops:extract` returns. The extracted document is adopted into the store. */
export interface ExtractDetail {
  /** Store id of the new document holding the extracted pages. */
  docId: string;
  extractedPages: number[];
  /** True when the source was rebuilt without those pages (`removeFromSource`). */
  sourceRebuilt: boolean;
  /** The source's page count after the op; unchanged unless `sourceRebuilt`. */
  sourcePageCount: number;
}

export interface InsertBlankOptions {
  /** 1-based index the blank page takes after insertion. */
  atPage: number;
  count: number;
  /** Defaults to the size of the page it is inserted before. */
  size?: { width: number; height: number };
}

export interface InsertFromOptions {
  atPage: number;
  sourceFilePath: string;
  /** Omit to insert every page of the source. */
  sourcePages?: number[];
}

/** A node in the document outline; children nest arbitrarily deep. */
export interface BookmarkNode {
  title: string;
  /** 1-based destination page. */
  page: number;
  children: BookmarkNode[];
}

export interface ScrubMetadataOptions {
  clearInfoDict: boolean;
  clearXmp: boolean;
  /** Also drop embedded file attachments rather than only warning. */
  removeAttachments: boolean;
}

export interface ScrubDetail {
  clearedFields: string[];
  attachmentsFound: number;
}

export interface FlattenOptions {
  /** Restrict to a subset; omit for the whole document. */
  pages?: number[];
}

export interface FlattenDetail {
  annotationsFlattened: number;
}

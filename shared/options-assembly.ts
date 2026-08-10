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

/** Evidence returned by merge: how many pages each source contributed. */
export interface MergeDetail {
  perSourcePages: number[];
}

export interface SplitOptions {
  /** Ranges such as "1-30, 31-60"; each range becomes one output document. */
  ranges: PageRangeSpec[];
}

export interface SplitDetail {
  /** One byte array per requested range, in request order. */
  parts: Uint8Array[];
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

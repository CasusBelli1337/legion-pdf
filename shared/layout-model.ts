/**
 * What one page LOOKS like, as plain data. The renderer extracts it with pdfjs
 * — the engine that draws the page on screen, and the only zone that can read
 * the loaded fonts and decoded images — and the main process consumes it to
 * build a Word document (core/export). Types only, re-exported type-only from
 * @shared/types.
 *
 * Coordinates are PDF user space throughout (origin bottom-left, points).
 */

import type { PageSize, PdfRect } from './types';

/** What a run of text is FOR — mirrors the viewer's selection roles. */
export type LayoutTextRole = 'body' | 'line-number' | 'page-number' | 'header' | 'footer' | 'stamp';

/** What a tagged PDF's structure tree says a block of text is. */
export type LayoutBlockRole =
  'paragraph' | 'heading' | 'list-item' | 'cell' | 'caption' | 'toc-entry' | 'note' | 'quote';

/** The paragraph-level block a run sits in, when the PDF is tagged. */
export interface LayoutBlock {
  /** Opaque, unique per block on the page; runs with the same id are one paragraph. */
  id: string;
  role: LayoutBlockRole;
}

export interface LayoutFont {
  /** The file's own name for the face, subset prefix stripped. */
  name: string;
  /** pdfjs' coarse read: "serif", "sans-serif", "monospace". */
  family: string;
  bold: boolean;
  italic: boolean;
  /** Ascent and descent as fractions of the size, when pdfjs reports them. */
  ascent?: number;
  descent?: number;
}

export interface LayoutTextRun {
  text: string;
  /** Baseline origin. */
  x: number;
  y: number;
  /** Advance of the whole run, in points. */
  width: number;
  sizePt: number;
  /** Key into `PageLayout.fonts`. */
  fontKey: string;
  /** Hex fill colour when known, e.g. "#000000". */
  colorHex?: string;
  role: LayoutTextRole;
  /** True when pdfjs marked the end of a line after this run. */
  eol: boolean;
  /** Text render mode 3 — invisible, i.e. an OCR layer over a scan. */
  hidden?: boolean;
  /** The tagged PDF's own paragraph for this run; absent when the PDF is untagged. */
  block?: LayoutBlock;
}

export interface LayoutImage {
  /** Where the image is drawn on the page. */
  rect: PdfRect;
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** A thin filled rectangle or stroked line — an underline, a rule, a table border. */
export interface LayoutRule {
  rect: PdfRect;
}

export interface PageLayout {
  page: number;
  size: PageSize;
  /** The page's /Rotate, degrees clockwise. */
  rotation: number;
  fonts: Record<string, LayoutFont>;
  runs: LayoutTextRun[];
  images: LayoutImage[];
  rules: LayoutRule[];
  /** The number PRINTED on the page, when one was recognised. */
  printedPageNumber: number | null;
}

/** Main asks the renderer for one page's layout, like a raster request. */
export interface LayoutRequest {
  requestId: string;
  docId: string;
  page: number;
}

export interface LayoutResponse {
  requestId: string;
  /** Null when `error` is set. */
  layout: PageLayout | null;
  error?: string;
}

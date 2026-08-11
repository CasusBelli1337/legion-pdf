/**
 * Option and detail shapes for the stamping lane (core/stamps/**): Bates,
 * exhibit stamps, slip sheets, watermarks, page numbers, signatures, text
 * boxes, whiteout. Types only — re-exported type-only from @shared/types.
 */

import type { Alignment, Corner, PdfPoint, PdfRect } from './types';

/* ── stamp: Bates, exhibits, watermarks, numbers, signatures, text ────── */

export interface BatesOptions {
  prefix: string;
  startNumber: number;
  /** Zero-pad width, e.g. 6 → ASHFORD000123. */
  padWidth: number;
  pages: number[];
  position: Corner;
  fontSize: number;
  /** Inset from the page edge, in PDF points. */
  margin: number;
  /** Draw a white backing box behind the number for legibility on scans. */
  whiteBackingBox: boolean;
}

/** Evidence: the exact string stamped on each page, for text-extraction QA. */
export interface BatesDetail {
  batesApplied: string[];
}

/**
 * Where an exhibit stamp lands: the four corners, plus the bottom edge centred
 * — the placement courts that want the label under the text block ask for.
 */
export type ExhibitPosition = Corner | 'bottom-center';

export interface ExhibitOptions {
  /** Rendered label, e.g. "EXHIBIT A". */
  label: string;
  pages: number[];
  position: ExhibitPosition;
  fontSize: number;
  margin: number;
  /** Classic bordered exhibit-stamp box around the label. */
  bordered: boolean;
}

export interface ExhibitDetail {
  labelsApplied: string[];
}

/** Insert a standalone "Exhibit A" sheet ahead of a page. */
export interface SlipSheetOptions {
  label: string;
  /** 1-based index the slip sheet occupies after insertion. */
  atPage: number;
}

export type WatermarkOrientation = 'diagonal' | 'horizontal';

export interface WatermarkOptions {
  text: string;
  pages: number[];
  orientation: WatermarkOrientation;
  /** 0-1. */
  opacity: number;
  fontSize: number;
  /** Hex, e.g. "#808080". */
  color: string;
}

export interface PageNumberOptions {
  /** Template with {n} and {total}, e.g. "Page {n} of {total}". */
  template: string;
  pages: number[];
  placement: 'header' | 'footer';
  alignment: Alignment;
  fontSize: number;
  margin: number;
  /** Number the first page in the range as this value. */
  startNumber: number;
}

export interface PageNumberDetail {
  numbersApplied: string[];
}

/** A signature image in the user's library (stored under userData). */
export interface SignatureAsset {
  id: string;
  label: string;
  /** Absolute path to the stored transparent PNG. */
  filePath: string;
  /**
   * data: URL of the PNG for renderer thumbnails — file:// is blocked from
   * the app origin, so the bytes travel inline. Populated by signatureList/Add.
   */
  dataUrl?: string;
  widthPx: number;
  heightPx: number;
  createdAt: string;
}

export interface SignaturePlacement {
  signatureId: string;
  page: number;
  /** Bottom-left corner in PDF user space. */
  at: PdfPoint;
  widthPt: number;
  heightPt: number;
  /** Stamp today's date beside the signature. */
  withDate: boolean;
  /** strftime-free display format, e.g. "MM/DD/YYYY". */
  dateFormat?: string;
}

/**
 * A face from the fourteen fonts every PDF reader has built in — no embedding,
 * no licence question. Omit `font` entirely for Helvetica regular.
 */
export interface TextFontChoice {
  family: 'helvetica' | 'times' | 'courier';
  bold?: boolean;
  italic?: boolean;
}

export interface TextBoxOptions {
  page: number;
  at: PdfPoint;
  text: string;
  fontSize: number;
  /** Hex color, e.g. "#000000". */
  color: string;
  /** Wrap width in points; omit for single-line. */
  maxWidthPt?: number;
  /** Omit for Helvetica regular, which is what every text box drew before. */
  font?: TextFontChoice;
}

export interface WhiteoutOptions {
  page: number;
  rect: PdfRect;
  /** Hex fill; defaults to white. Sampled background color when provided. */
  color?: string;
}

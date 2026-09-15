/**
 * Editing the text a page ALREADY carries (the text-edit lane): what the
 * renderer learns about the paragraph under a click, and what it sends back to
 * have that paragraph rewritten. Types only, re-exported type-only from
 * @shared/types.
 */

import type { TextFontChoice } from './options-marks';
import type { PdfPoint, PdfRect } from './types';

/** Where the attorney clicked, in PDF user space, and on which page. */
export interface TextEditProbe {
  page: number;
  at: PdfPoint;
}

export interface TextEditLine {
  text: string;
  /** Baseline y in PDF user space. */
  baseline: number;
  /** Left edge of the first glyph, in PDF user space. */
  x: number;
  /** Advance of the whole line, in points. */
  width: number;
}

export interface TextEditFont {
  /** The file's own name for the face, subset prefix stripped; '' when unnamed. */
  documentFont: string;
  sizePt: number;
  /** Hex fill colour of the text, e.g. "#000000". */
  colorHex: string;
  bold: boolean;
  italic: boolean;
  /**
   * True when the document's own font can set NEW text: its character map can
   * be run backwards, so an edit stays in the same face. False means an edit
   * is set in the closest built-in face and says so.
   */
  reusable: boolean;
}

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

/** The paragraph under a click: what it says, where it sits, how it is set. */
export interface TextEditBlock {
  page: number;
  /** Bounds of the paragraph in PDF user space. */
  rect: PdfRect;
  lines: TextEditLine[];
  /** The paragraph's text, lines joined with '\n'. What the editor is seeded with. */
  text: string;
  font: TextEditFont;
  /** Baseline-to-baseline distance in points; the size when there is one line. */
  leadingPt: number;
  alignment: TextAlignment;
}

export interface ReplaceTextOptions {
  page: number;
  /** The block `edit:inspect` returned — it identifies the operators to rewrite. */
  block: TextEditBlock;
  /** The replacement paragraph. Empty deletes it. */
  text: string;
  /** Plan the edit and report `detail` without changing the document. */
  dryRun?: boolean;
}

export interface ReplaceTextDetail {
  /** Whether the new text went in the document's own font or a built-in one. */
  fontMode: 'document-font' | 'built-in-font';
  /** Characters the document's font cannot show; empty in document-font mode. */
  missingCharacters: string[];
  /** The face used in built-in-font mode. */
  builtInFont?: TextFontChoice;
  linesBefore: number;
  linesAfter: number;
  /** True when the new text needed more lines than the original paragraph had. */
  overflowed: boolean;
  glyphsRemoved: number;
  glyphsAdded: number;
}

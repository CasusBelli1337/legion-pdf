/**
 * The last gate, and the only one that reads the document the way a human does.
 *
 * The main process proves destruction on bytes: rebuilt pages must draw no text
 * at all, and each marked term must have lost at least as many copies as were
 * marked. Neither reading can see through a subset font whose glyph codes are
 * not the letters they draw, and neither knows WHERE on the page a word sits.
 *
 * pdfjs can do both: it is the same engine that drew the page on screen, it maps
 * glyphs back to text, and it reports the position of every run. So this gate
 * asks the narrowest, most honest question there is — can the text the attorney
 * marked still be read INSIDE the rectangle they marked it in? Copies of the
 * same words elsewhere on the page were never marked and are none of this gate's
 * business, and neither is the noise re-OCR reads off a black rectangle: a burn
 * that worked leaves an opaque box, and Tesseract routinely calls that "ii".
 * What must never come back is the marked text itself, or a real piece of it.
 */

import type { PdfRect } from '@shared/types';
import { readPageTextBoxes } from './page-text-boxes';
import type { PageTextBoxes, TextBox } from './page-text-boxes';
import type { RedactionFindings } from './redact-messages';

/** One region the attorney marked, and the text they marked there. */
export interface MarkedArea {
  page: number;
  rect: PdfRect;
  /** The hit's text, when the mark came from a search. Absent on a drawn box. */
  text?: string;
}

export interface PdfjsProofRequest {
  /** The bytes the main process just returned. */
  bytes: Uint8Array;
  /** 1-based pages that were rebuilt from a raster. */
  pages: readonly number[];
  /** The regions marked on those pages — the only places that must be silent. */
  areas: readonly MarkedArea[];
  /** True while the rebuilt pages are pure images (no re-OCR was asked for). */
  expectNoText: boolean;
}

/**
 * How much of a text run must sit inside a mark before it counts as readable
 * there. Search-derived marks are grown by QUAD_PADDING_PT on every side, so a
 * mark reaches a couple of points into the words beside it; half a run's area is
 * far more than that graze and far less than a word the burn missed. Recognized
 * words are drawn on the ink they came from, so a word the black rectangle
 * covers cannot be read back at all — any overlap at this size means the pixels
 * under the mark were never destroyed.
 */
const INSIDE_FRACTION = 0.5;

/**
 * The shortest run inside a mark that can still be a piece of the destroyed
 * text rather than burn noise. Three characters of a social security number is
 * a leak; "ii" off a black rectangle is not.
 */
const MIN_FRAGMENT = 4;

/** Nothing survived — the only shape that lets a tab open. */
export function isClean(findings: RedactionFindings): boolean {
  return (
    findings.survivingStrings.length === 0 &&
    findings.textInMarkedAreas.length === 0 &&
    findings.pagesStillCarryingText.length === 0
  );
}

function overlapArea(box: PdfRect, mark: PdfRect): number {
  const width = Math.min(box.x + box.width, mark.x + mark.width) - Math.max(box.x, mark.x);
  const height = Math.min(box.y + box.height, mark.y + mark.height) - Math.max(box.y, mark.y);
  return width <= 0 || height <= 0 ? 0 : width * height;
}

function sitsInside(box: TextBox, marks: readonly PdfRect[]): boolean {
  const area = box.rect.width * box.rect.height;
  if (area <= 0) return false;
  return marks.some((mark) => overlapArea(box.rect, mark) / area >= INSIDE_FRACTION);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * The marked text, or a real piece of it, read back from inside its own mark —
 * or null when the runs found there are only what an opaque rectangle produces.
 *
 * A hand-drawn box names no text, so nothing can be claimed about it here; with
 * re-OCR off, page silence proves it, and with re-OCR on the burn itself is the
 * proof (`burnRects` refuses to report a redaction that painted no pixels).
 */
function leakedFrom(area: MarkedArea, fragments: readonly string[]): string | null {
  const term = normalize(area.text ?? '');
  if (term.length === 0) return null;
  if (normalize(fragments.join('')).includes(term)) return area.text ?? null;
  return (
    fragments.find((fragment) => {
      const piece = normalize(fragment);
      return piece.length >= MIN_FRAGMENT && term.includes(piece);
    }) ?? null
  );
}

/** Every mark whose own text is still readable inside it. Empty is the proof. */
function readableInMarkedAreas(
  pages: readonly PageTextBoxes[],
  areas: readonly MarkedArea[]
): string[] {
  const found = new Set<string>();
  for (const page of pages) {
    for (const area of areas.filter((mark) => mark.page === page.page)) {
      const fragments = page.boxes
        .filter((box) => box.text.trim().length > 0 && sitsInside(box, [area.rect]))
        .map((box) => box.text.trim());
      const leak = leakedFrom(area, fragments);
      if (leak !== null) found.add(leak);
    }
  }
  return [...found];
}

function pagesStillCarryingText(pages: readonly PageTextBoxes[]): number[] {
  return pages
    .filter((page) => page.boxes.some((box) => box.text.trim().length > 0))
    .map((page) => page.page);
}

export async function proveWithPdfjs(request: PdfjsProofRequest): Promise<RedactionFindings> {
  if (request.pages.length === 0) {
    return { survivingStrings: [], textInMarkedAreas: [], pagesStillCarryingText: [] };
  }
  const pages = await readPageTextBoxes(request.bytes, request.pages);
  return {
    survivingStrings: [],
    textInMarkedAreas: readableInMarkedAreas(pages, request.areas),
    pagesStillCarryingText: request.expectNoText ? pagesStillCarryingText(pages) : [],
  };
}

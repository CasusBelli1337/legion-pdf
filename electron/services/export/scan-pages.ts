/**
 * What the Word exporter says and checks about scanned pages.
 *
 * A page with no text layer is a picture of words. Word cannot edit a picture,
 * so the export recognizes the page first and exports the recognized words —
 * which means the attorney is reading a machine's reading of the document. The
 * notes here say so, page by page, with the recognizer's own confidence, and
 * the assertions refuse the two ways that step can quietly go wrong: a page
 * that was never recognized, and a page that came back with nothing on it.
 *
 * Pure functions, no Electron: `docx-exporter.test.ts` grades them directly.
 */

import type { ExportReceipt, OcrRunDetail, OpResult } from '@shared/types';

export const PHASE_RECOGNIZE = 'Recognizing text on scanned pages';

export const DETECTION_FAILED_NOTE =
  'Legion PDF could not tell whether any page was a scan, so no text was recognized. ' +
  'If a page comes out empty, run Text Recognition on it and export again.';

/** The pages of THIS export that carry no text layer, in page order. */
export function scansWithin(
  pages: readonly number[],
  pagesNeedingOcr: readonly number[]
): number[] {
  const needing = new Set(pagesNeedingOcr);
  return pages.filter((page) => needing.has(page));
}

/**
 * Every scanned page came back recognized, with words on it. A page that
 * recognized to nothing is an ERROR, never an empty page in the Word file:
 * "fast and empty" is exactly what a silent failure looks like.
 */
export function assertEveryScanRecognized(
  scans: readonly number[],
  result: OpResult<OcrRunDetail>
): void {
  const { pagesOcred, wordsPerPage } = result.detail;
  const missing = scans.filter((page) => !pagesOcred.includes(page));
  if (missing.length > 0) {
    throw new Error(
      `Text recognition covered ${pagesOcred.length} of the ${scans.length} scanned pages ` +
        `— ${missing.join(', ')} came back with nothing. Nothing was saved.`
    );
  }
  const empty = pagesOcred.filter((_page, index) => (wordsPerPage[index] ?? 0) === 0);
  if (empty.length > 0) {
    throw new Error(
      `No text could be recognized on ${empty.length === 1 ? 'page' : 'pages'} ` +
        `${empty.join(', ')}. Rather than write ${empty.length === 1 ? 'an empty page' : 'empty pages'} ` +
        'into the Word file, the export stopped. Nothing was saved.'
    );
  }
}

function confidenceClause(confidence: number | undefined): string {
  if (confidence === undefined || !Number.isFinite(confidence)) return '';
  return ` (${Math.round(confidence)}% average confidence)`;
}

/** One line per scanned page: what happened to it, and what to double-check. */
export function scanNotes(detail: OcrRunDetail): string[] {
  return detail.pagesOcred.map(
    (page, index) =>
      `Page ${page} was a scan; its text was recognized` +
      `${confidenceClause(detail.confidencePerPage?.[index])} — check names and numbers.`
  );
}

/** What the attorney keeps and what they lose, both in their own words. */
export function receiptWith(
  receipt: ExportReceipt | undefined,
  kept: readonly string[],
  dropped: readonly string[]
): ExportReceipt {
  return {
    kept: [...(receipt?.kept ?? []), ...kept],
    dropped: [...(receipt?.dropped ?? []), ...dropped],
  };
}

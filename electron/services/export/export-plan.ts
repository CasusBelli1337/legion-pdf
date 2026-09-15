/**
 * What a Word export is about to do, said BEFORE the button is pressed.
 *
 * The three things that surprise an attorney after the fact are the three
 * things this answers: a scan that had to be read by a machine, pleading paper
 * whose numbered lines have to be rebuilt, and Bates numbers that cannot come
 * across. Saying them first turns "why is my export wrong?" into a choice.
 *
 * Looking is cheap and must stay cheap — the panel asks again on every change
 * of document, format, or page range — so only the first few pages that hold
 * text are read, and a page that will not answer is skipped rather than taking
 * the whole preview down with it.
 */

import { detectTextLayer } from '@core/ocr';
import { pleadingOf } from '@core/export';
import type { ExportFormat, ExportPlan, OcrDetectResult, PageLayout } from '@shared/types';

/** Pages sampled for pleading paper and stamps. Three is enough to know. */
export const SAMPLE_PAGES = 3;

export interface PlanFacts {
  pageCount: number;
  /** 1-based pages with no text layer. */
  scannedPages: number[];
  /** 1-based sampled pages that are pleading paper. */
  pleadingPages: number[];
  /** A Bates number or stamp was seen on a sampled page. */
  stamped: boolean;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

const PLEADING_LINE =
  'Pleading paper detected: line numbers and rules will be rebuilt so line 14 stays line 14.';

const BATES_LINE = 'Bates numbers will be left out; they differ on every page.';

function scanLine(count: number): string {
  const pictures = count === 1 ? 'its picture' : 'their pictures';
  return (
    `${count} scanned ${plural(count, 'page')} will be recognized first. ` +
    `Choose below what happens to ${pictures}.`
  );
}

/** The sentences the panel shows, in the order they matter to the attorney. */
export function planLines(facts: PlanFacts): string[] {
  const lines: string[] = [];
  if (facts.pleadingPages.length > 0) lines.push(PLEADING_LINE);
  if (facts.scannedPages.length > 0) lines.push(scanLine(facts.scannedPages.length));
  if (facts.stamped) lines.push(BATES_LINE);
  return lines;
}

export interface PlanInput {
  format: ExportFormat;
  /** The pages the export would cover, already resolved against the document. */
  pages: readonly number[];
  bytes: Uint8Array;
  /** One page's layout, or null when the renderer could not read it. */
  requestLayout(page: number): Promise<PageLayout | null>;
  /** Injectable for tests; the real text-layer detector otherwise. */
  detect?(bytes: Uint8Array): Promise<OcrDetectResult>;
}

/** A page that will not answer tells us nothing; it must not lose the rest. */
async function layoutOrNull(input: PlanInput, page: number): Promise<PageLayout | null> {
  try {
    return await input.requestLayout(page);
  } catch {
    return null;
  }
}

async function factsOf(input: PlanInput, scannedPages: number[]): Promise<PlanFacts> {
  const typed = input.pages.filter((page) => !scannedPages.includes(page)).slice(0, SAMPLE_PAGES);
  const facts: PlanFacts = {
    pageCount: input.pages.length,
    scannedPages,
    pleadingPages: [],
    stamped: false,
  };
  for (const page of typed) {
    const layout = await layoutOrNull(input, page);
    if (layout === null) continue;
    if (pleadingOf(layout) !== null) facts.pleadingPages.push(page);
    if (layout.runs.some((run) => run.role === 'stamp')) facts.stamped = true;
  }
  return facts;
}

/**
 * The plan for one export. Only Word is rebuilt page by page, so only Word has
 * anything to warn about; the other formats answer an honest empty plan rather
 * than spending a detection pass to say nothing.
 */
export async function exportPlan(input: PlanInput): Promise<ExportPlan> {
  const empty: ExportPlan = {
    format: input.format,
    pageCount: input.pages.length,
    scannedPages: [],
    pleadingPages: [],
    lines: [],
  };
  if (input.format !== 'docx') return empty;
  const detect = input.detect ?? detectTextLayer;
  const detected = await detect(input.bytes).catch(() => null);
  const scannedPages =
    detected === null ? [] : input.pages.filter((page) => detected.pagesNeedingOcr.includes(page));
  const facts = await factsOf(input, scannedPages);
  return {
    format: 'docx',
    pageCount: facts.pageCount,
    scannedPages: facts.scannedPages,
    pleadingPages: facts.pleadingPages,
    lines: planLines(facts),
  };
}

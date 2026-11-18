/**
 * What a Word export is about to do, said BEFORE the button is pressed.
 *
 * The things that surprise an attorney after the fact are the things this
 * answers: a scan that had to be read by a machine, scanned exhibits kept as
 * pictures, pleading paper whose numbered lines have to be rebuilt, and Bates
 * numbers that cannot come across. Saying them first turns "why is my export wrong?" into a choice.
 *
 * Which pages are kept as pictures is the exporter's own decision
 * (`picturePagesOf`), made over the same pages it will read — a count taken
 * any other way disagreed with the export (96 promised, 98 kept). So every
 * page in the range is read, once: the caller reads them light (no picture
 * pixels) and remembers them per document (plan-layouts.ts), which keeps the
 * panel's second question — a new page range — instant. A page that will not
 * answer is skipped rather than taking the whole preview down with it.
 */

import { detectTextLayer } from '@core/ocr';
import { picturePagesOf, pleadingOf } from '@core/export';
import type { ExportFormat, ExportPlan, OcrDetectResult, PageLayout } from '@shared/types';

/** Typed pages looked at for pleading paper and stamps. Three is enough to know. */
export const SAMPLE_PAGES = 3;

export interface PlanFacts {
  pageCount: number;
  /** 1-based pages with no text layer that will be recognized. */
  scannedPages: number[];
  /** 1-based pages the export keeps as pictures: exhibits behind typed pages, loose sheets among scans. */
  exhibitPages?: number[];
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

function exhibitLine(count: number): string {
  return count === 1
    ? '1 scanned page is an attachment (an exhibit, an envelope). It will be kept as a picture of the page; export it on its own to get its words.'
    : `${count} scanned pages are attachments (exhibits, an envelope). Each will be kept as a picture of the page; export them on their own to get their words.`;
}

/** The sentences the panel shows, in the order they matter to the attorney. */
export function planLines(facts: PlanFacts): string[] {
  const lines: string[] = [];
  if (facts.pleadingPages.length > 0) lines.push(PLEADING_LINE);
  if (facts.scannedPages.length > 0) lines.push(scanLine(facts.scannedPages.length));
  if ((facts.exhibitPages ?? []).length > 0) {
    lines.push(exhibitLine(facts.exhibitPages?.length ?? 0));
  }
  if (facts.stamped) lines.push(BATES_LINE);
  return lines;
}

export interface PlanInput {
  format: ExportFormat;
  /** The pages the export would cover, already resolved against the document. */
  pages: readonly number[];
  bytes: Uint8Array;
  /** One page's layout (its pictures' pixels are not needed), or null when the renderer could not read it. */
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

async function layoutsOf(input: PlanInput): Promise<PageLayout[]> {
  const layouts: PageLayout[] = [];
  for (const page of input.pages) {
    const layout = await layoutOrNull(input, page);
    if (layout !== null) layouts.push(layout);
  }
  return layouts;
}

async function factsOf(input: PlanInput, noTextPages: number[]): Promise<PlanFacts> {
  const layouts = await layoutsOf(input);
  const exhibits = picturePagesOf(layouts);
  const facts: PlanFacts = {
    pageCount: input.pages.length,
    scannedPages: noTextPages.filter((page) => !exhibits.includes(page)),
    pleadingPages: [],
    stamped: false,
  };
  if (exhibits.length > 0) facts.exhibitPages = exhibits;
  const typed = layouts
    .filter((layout) => !noTextPages.includes(layout.page) && !exhibits.includes(layout.page))
    .slice(0, SAMPLE_PAGES);
  for (const layout of typed) {
    if (pleadingOf(layout) !== null) facts.pleadingPages.push(layout.page);
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

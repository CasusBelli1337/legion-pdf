/**
 * What a Word export is about to do, said BEFORE the button is pressed.
 *
 * The things that surprise an attorney after the fact are the things this
 * answers: a scan that had to be read by a machine, scanned exhibits kept as
 * pictures, pleading paper whose numbered lines have to be rebuilt, and Bates
 * numbers that cannot come across. Saying them first turns "why is my export wrong?" into a choice.
 *
 * Looking is cheap and must stay cheap — the panel asks again on every change
 * of document, format, or page range — so only the first few pages that hold
 * text are read, and a page that will not answer is skipped rather than taking
 * the whole preview down with it.
 */

import { detectTextLayer } from '@core/ocr';
import { picturePagesOf, pleadingOf } from '@core/export';
import type { ExportFormat, ExportPlan, OcrDetectResult, PageLayout } from '@shared/types';

/** Pages sampled for pleading paper and stamps. Three is enough to know. */
export const SAMPLE_PAGES = 3;

export interface PlanFacts {
  pageCount: number;
  /** 1-based pages with no text layer that will be recognized. */
  scannedPages: number[];
  /** 1-based pages with no text layer that come behind typed pages: kept as pictures. */
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
    ? '1 scanned page sits behind typed pages (an exhibit). It will be kept as a picture of the page; export it on its own to get its words.'
    : `${count} scanned pages sit behind typed pages (exhibits). Each will be kept as a picture of the page; export them on their own to get their words.`;
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

/**
 * The scans that come after the first sampled page the exporter would call
 * typed — the ones it keeps as pictures. Judged with the exporter's own rule
 * (`picturePagesOf`) over the sampled page and bare stand-ins for the scans,
 * so the plan and the export cannot disagree about a page with no text.
 */
function exhibitsAmong(scannedPages: readonly number[], sampled: readonly PageLayout[]): number[] {
  const bare = scannedPages.map((page): PageLayout => ({
    page,
    size: { width: 612, height: 792 },
    rotation: 0,
    fonts: {},
    runs: [],
    images: [],
    rules: [],
    printedPageNumber: null,
  }));
  const inOrder = [...sampled, ...bare].sort((a, b) => a.page - b.page);
  const pictures = new Set(picturePagesOf(inOrder));
  return scannedPages.filter((page) => pictures.has(page));
}

async function factsOf(input: PlanInput, noTextPages: number[]): Promise<PlanFacts> {
  const typed = input.pages.filter((page) => !noTextPages.includes(page)).slice(0, SAMPLE_PAGES);
  const facts: PlanFacts = {
    pageCount: input.pages.length,
    scannedPages: noTextPages,
    pleadingPages: [],
    stamped: false,
  };
  const sampled: PageLayout[] = [];
  for (const page of typed) {
    const layout = await layoutOrNull(input, page);
    if (layout === null) continue;
    sampled.push(layout);
    if (pleadingOf(layout) !== null) facts.pleadingPages.push(page);
    if (layout.runs.some((run) => run.role === 'stamp')) facts.stamped = true;
  }
  const exhibits = exhibitsAmong(noTextPages, sampled);
  if (exhibits.length > 0) {
    facts.exhibitPages = exhibits;
    facts.scannedPages = noTextPages.filter((page) => !exhibits.includes(page));
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

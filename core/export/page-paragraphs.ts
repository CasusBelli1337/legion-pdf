/**
 * One page's body as a sequence of paragraphs — text and pictures in reading
 * order, each carrying the space that separated it from the one above. The
 * vertical arithmetic here is what keeps a page in Word the same height as the
 * page in the PDF: every paragraph's line box is exact, Word puts the baseline
 * 80% of the way down that box (BASELINE_SHARE), and the gaps between boxes
 * become space-before.
 *
 * A two-column page is two flows, each settled from the top of the body; the
 * second opens with a column break so Word starts it in its own column.
 *
 * On pleading paper the gaps become EMPTY PARAGRAPHS on the pitch, so a blank
 * numbered line is a line the attorney can click into, as it is in the
 * templates the filing came from.
 *
 * Two paragraphs' line boxes must never overlap: the space between them is
 * space-before, which cannot go negative, so an overlap would push the lower
 * paragraph down the page. A lone line's box is shrunk to fit above the
 * paragraph below it; a multi-line paragraph keeps its pitch and the one
 * above it gives way instead.
 */

import type { LayoutTextRun, PageLayout, ScanPictureMode } from '@shared/types';
import { planImages } from './images';
import { linesOf } from './lines';
import { BASELINE_SHARE } from './model';
import type { BodyFrame, Paragraph, TextParagraph } from './model';
import type { SectionGeometry } from './page-setup';
import { columnRunsOf } from './page-setup';
import { paragraphsOf } from './paragraphs';
import { LINE_NUMBERS_NOTE, NUMBERED_LINES_NOTE, PLEADING_NOTE, type Pleading } from './pleading';
import { ruledTablesOf } from './tables';

/** Word will not set a line tighter than this. */
const MIN_LEADING = 1;

export interface PageOptions {
  scanPictures: ScanPictureMode;
}

export interface PageBox {
  /** Top of the first line box on the page. */
  top: number;
  /** Bottom of the last line box on the page. */
  bottom: number;
}

export interface PageBuild {
  /** One flow per column, each in reading order; `spaceBeforePt` is settled by `settlePage`. */
  columns: Paragraph[][];
  notes: string[];
  pleading: Pleading | null;
  /** Where the page's content boxes begin and end — what sets the section's margins. */
  box: PageBox;
}

/**
 * A transcript: numbered lines set in a monospaced face. Court reporters'
 * software writes every line as its own paragraph, and attorneys cite
 * testimony by page and line, so the lines are kept exactly as they were
 * rather than flowed into paragraphs Word would re-wrap.
 */
export function isTranscript(layout: PageLayout): boolean {
  const weights = new Map<boolean, number>();
  for (const run of layout.runs) {
    if (run.role !== 'body') continue;
    const font = layout.fonts[run.fontKey];
    const mono = font?.family === 'monospace' || /courier|mono/i.test(font?.name ?? '');
    weights.set(mono, (weights.get(mono) ?? 0) + run.text.length);
  }
  return (weights.get(true) ?? 0) > (weights.get(false) ?? 0);
}

/** Top and bottom of a paragraph's box on the page, the way Word will lay it. */
function boxOf(paragraph: Paragraph): PageBox {
  if (paragraph.kind === 'image') {
    return { top: paragraph.top, bottom: paragraph.image.rect.y };
  }
  if (paragraph.kind === 'table') return { top: paragraph.top, bottom: paragraph.bottom };
  const first = paragraph.lines[0];
  const last = paragraph.lines.at(-1);
  // A blank numbered line placed by position: its box is exactly one leading tall.
  if (first === undefined)
    return { top: paragraph.top, bottom: paragraph.top - paragraph.leadingPt };
  return {
    top: (first?.baseline ?? 0) + BASELINE_SHARE * paragraph.leadingPt,
    bottom: (last?.baseline ?? 0) - (1 - BASELINE_SHARE) * paragraph.leadingPt,
  };
}

/** The page's content box: its paragraphs', widened to the numbered column on pleading paper. */
function pageBox(paragraphs: readonly Paragraph[], pleading: Pleading | null): PageBox {
  const boxes = paragraphs.map(boxOf);
  if (pleading !== null) {
    boxes.push({
      top: pleading.firstBaseline + BASELINE_SHARE * pleading.pitchPt,
      bottom: pleading.lastBaseline - (1 - BASELINE_SHARE) * pleading.pitchPt,
    });
  }
  if (boxes.length === 0) return { top: 0, bottom: 0 };
  return {
    top: Math.max(...boxes.map((box) => box.top)),
    bottom: Math.min(...boxes.map((box) => box.bottom)),
  };
}

function blankLine(pitchPt: number): TextParagraph {
  return {
    kind: 'text',
    lines: [],
    alignment: 'left',
    leadingPt: pitchPt,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLinePt: 0,
    spaceBeforePt: 0,
    tabStopsPt: [],
    top: 0,
  };
}

/**
 * On pleading paper, space above a paragraph is so many numbered blank lines;
 * what is left over (never a whole line) stays as space, so nothing is pushed
 * down by a line that the PDF did not have.
 */
function asNumberedBlanks(paragraphs: Paragraph[], pitchPt: number): Paragraph[] {
  const out: Paragraph[] = [];
  for (const paragraph of paragraphs) {
    const blanks = Math.floor(paragraph.spaceBeforePt / pitchPt + 0.05);
    for (let count = 0; count < blanks; count += 1) out.push(blankLine(pitchPt));
    const remainder = paragraph.spaceBeforePt - blanks * pitchPt;
    // Under a third of a point is measurement noise, not a gap the page had.
    paragraph.spaceBeforePt = remainder < 0.3 ? 0 : remainder;
    out.push(paragraph);
  }
  return out;
}

/** A body run sits on this baseline, within a couple of points. */
function hasTextAt(layout: PageLayout, y: number): boolean {
  return layout.runs.some(
    (run) => run.role === 'body' && run.text.trim().length > 0 && Math.abs(run.y - y) <= 2
  );
}

/**
 * When the numbers followed the text (Word's own numbering), a printed number
 * with no text beside it was an empty paragraph, and Word must be given one
 * of the same height there so its numbering counts the same lines.
 */
function numberedBlanks(layout: PageLayout, pleading: Pleading): TextParagraph[] {
  const numbers = layout.runs
    .filter((run) => run.role === 'line-number' && /^\d{1,2}$/.test(run.text.trim()))
    .sort((a, b) => b.y - a.y);
  return numbers.flatMap((run, index) => {
    if (hasTextAt(layout, run.y)) return [];
    const next = numbers[index + 1];
    const leading = next === undefined ? pleading.pitchPt : run.y - next.y;
    const blank = blankLine(leading);
    blank.top = run.y + BASELINE_SHARE * leading;
    return [blank];
  });
}

function byPosition(a: Paragraph, b: Paragraph): number {
  return b.top - a.top;
}

/** The frame each column's paragraphs are measured against. */
function columnFrames(geometry: SectionGeometry, columns: readonly LayoutTextRun[][]): BodyFrame[] {
  const { frame } = geometry;
  if (geometry.columns.count !== 2 || columns.length !== 2) return [frame];
  const [first = 0, second = 0] = geometry.columns.widths;
  const textRight = (runs: readonly LayoutTextRun[]) =>
    Math.max(...runs.map((run) => run.x + run.width));
  return [
    { left: frame.left, right: frame.left + first, textRight: textRight(columns[0] ?? []) },
    {
      left: geometry.columns.secondLeft,
      right: geometry.columns.secondLeft + second,
      textRight: textRight(columns[1] ?? []),
    },
  ];
}

/** One column's flow: its text paragraphs and the pictures that sit in it, by position. */
function columnFlow(
  layout: PageLayout,
  runs: LayoutTextRun[],
  frame: BodyFrame,
  pleading: Pleading | null,
  notes: string[],
  options: PageOptions
): Paragraph[] {
  const lines = linesOf(runs, layout.rules);
  const ruled = ruledTablesOf(lines, layout.rules, frame);
  const text = paragraphsOf(
    lines.filter((line) => !ruled.consumed.has(line)),
    {
      frame,
      ...(pleading === null ? {} : { leadingPt: pleading.pitchPt }),
      linePerParagraph: pleading !== null && isTranscript(layout),
    }
  );
  const images = layout.images.filter((image) => {
    const centre = image.rect.x + image.rect.width / 2;
    return centre >= frame.left - 1 && centre <= frame.right + 1;
  });
  const plan = planImages({ ...layout, images }, frame, {
    hasText: runs.length > 0,
    hasHiddenText: runs.some((run) => run.hidden === true),
    scanPictures: options.scanPictures,
  });
  notes.push(...plan.notes);
  const blanks = pleading !== null && !pleading.grid ? numberedBlanks(layout, pleading) : [];
  return [...text, ...blanks, ...ruled.tables, ...plan.paragraphs].sort(byPosition);
}

/** The page's paragraphs in reading order, per column, with the box they occupy. */
export function pageParagraphs(
  layout: PageLayout,
  geometry: SectionGeometry,
  options: PageOptions = { scanPictures: 'omit' }
): PageBuild {
  const { pleading } = geometry;
  const columns = columnRunsOf(layout);
  const frames = columnFrames(geometry, columns);
  const notes: string[] = [];
  const flows = columns.map((runs, index) =>
    columnFlow(layout, runs, frames[index] ?? geometry.frame, pleading, notes, options)
  );
  if (pleading !== null) notes.push(pleading.grid ? PLEADING_NOTE : NUMBERED_LINES_NOTE);
  else if (layout.runs.some((run) => run.role === 'line-number')) notes.push(LINE_NUMBERS_NOTE);
  return { columns: flows, notes, pleading, box: pageBox(flows.flat(), pleading) };
}

function firstBaseline(paragraph: TextParagraph): number {
  return paragraph.lines[0]?.baseline ?? 0;
}

function lastBaseline(paragraph: TextParagraph): number {
  return paragraph.lines.at(-1)?.baseline ?? 0;
}

/** Shrinks leadings, top down, until no paragraph's box reaches into the one above. */
function resolveOverlaps(paragraphs: Paragraph[], topOfBody: number): void {
  let previous: Paragraph | null = null;
  let previousBottom = topOfBody;
  for (const paragraph of paragraphs) {
    if (paragraph.kind === 'text' && paragraph.lines.length > 0) {
      const top = firstBaseline(paragraph) + BASELINE_SHARE * paragraph.leadingPt;
      if (top > previousBottom) giveWay(previous, paragraph, previousBottom);
    }
    previousBottom = boxOf(paragraph).bottom;
    previous = paragraph;
  }
}

/** The lone line above gives way; otherwise the lower paragraph tightens. */
function giveWay(previous: Paragraph | null, current: TextParagraph, previousBottom: number): void {
  if (previous?.kind === 'text' && previous.lines.length === 1 && current.lines.length > 1) {
    const room =
      lastBaseline(previous) - (firstBaseline(current) + BASELINE_SHARE * current.leadingPt);
    previous.leadingPt = Math.max(MIN_LEADING, room / (1 - BASELINE_SHARE));
    if (
      lastBaseline(previous) - (1 - BASELINE_SHARE) * previous.leadingPt >=
      firstBaseline(current) + BASELINE_SHARE * current.leadingPt
    )
      return;
  }
  const room = previousBottom - firstBaseline(current);
  current.leadingPt = Math.max(MIN_LEADING, room / BASELINE_SHARE);
}

/**
 * A page is not all on one pitch: an attorney block runs on twelve points
 * above a double-spaced brief. A lone line handed the page's median pitch gets
 * a line box taller than the gap it sat in; it keeps the pitch it actually
 * followed instead, never tighter than its own type.
 */
function ownPitch(paragraph: TextParagraph, previousBaseline: number | null): number {
  const line = paragraph.lines[0];
  if (line === undefined || paragraph.lines.length > 1 || previousBaseline === null) {
    return paragraph.leadingPt;
  }
  const gap = previousBaseline - line.baseline;
  if (gap <= 0 || gap >= paragraph.leadingPt) return paragraph.leadingPt;
  return Math.max(gap, line.sizePt);
}

function keepOwnPitches(paragraphs: Paragraph[]): void {
  let previousBaseline: number | null = null;
  for (const paragraph of paragraphs) {
    if (paragraph.kind !== 'text') {
      previousBaseline = null;
      continue;
    }
    paragraph.leadingPt = ownPitch(paragraph, previousBaseline);
    previousBaseline = lastBaseline(paragraph);
  }
}

function settleColumn(paragraphs: Paragraph[], topOfBody: number): void {
  keepOwnPitches(paragraphs);
  resolveOverlaps(paragraphs, topOfBody);
  let previousBottom = topOfBody;
  for (const paragraph of paragraphs) {
    const box = boxOf(paragraph);
    paragraph.spaceBeforePt = Math.max(0, previousBottom - box.top);
    previousBottom = box.bottom;
  }
}

/**
 * Space-before for each paragraph from the gap above it, each column starting
 * at the top of the body; on pleading paper, as numbered blank lines instead.
 * Returns the page's paragraphs in one flow, column two opening with a break.
 */
export function settlePage(build: PageBuild, topOfBody: number): Paragraph[] {
  return build.columns.flatMap((column, index) => {
    settleColumn(column, topOfBody);
    const settled =
      build.pleading?.grid === true ? asNumberedBlanks(column, build.pleading.pitchPt) : column;
    const first = settled[0];
    if (index > 0 && first !== undefined) first.columnBreakBefore = true;
    return settled;
  });
}

/** True when any paragraph on the page was set as tab-stop columns. */
export function hasTabColumns(paragraphs: readonly Paragraph[]): boolean {
  return paragraphs.some(
    (paragraph) => paragraph.kind === 'text' && paragraph.tabStopsPt.length > 0
  );
}

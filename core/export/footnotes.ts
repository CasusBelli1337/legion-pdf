/**
 * Footnotes, found at the foot of a page and handed to Word as footnotes: the
 * reference mark in the body becomes Word's own, and the note's text leaves
 * the body for the footnote it belongs to, so it travels with its mark as the
 * attorney edits.
 *
 * A page's footnotes are the paragraphs under the short rule Word draws above
 * them, each opening with a small raised number. A note is only lifted when
 * its number has exactly one raised twin in the text above the rule, and the
 * numbers run on from the last page's — Word numbers footnotes itself, so a
 * note that could not be paired would renumber every one after it. A page that
 * fails any of this keeps its notes as the paragraphs they were (`kept`), and
 * so does every page after it.
 */

import type { LayoutRule, PageLayout } from '@shared/types';
import { BASELINE_SHARE } from './model';
import type { Paragraph, StyledRun, TextParagraph } from './model';
import { settlePage } from './page-paragraphs';
import type { PageBuild } from './page-paragraphs';

/** Word's footnote separator is two inches of hairline; other producers' are near it. */
const SEPARATOR_MIN_WIDTH = 100;
const SEPARATOR_MAX_WIDTH = 200;
const SEPARATOR_MAX_HEIGHT = 1.5;
/** The first note starts within this many type sizes under the rule. */
const SEPARATOR_REACH = 2.5;
/** A rule this close under a baseline is that text's underline, not a separator. */
const UNDERLINE_REACH = 4;
/** The least room (points) a page must leave between its body and its notes for a separator. */
export const SEPARATOR_ROOM = 3.5;
const MARK = /^\s*(\d{1,3})\s*$/;

export interface Footnote {
  /** The number printed on the page, which is also the number Word will give it. */
  id: number;
  /** The printed mark as the page set it — what Word's own mark is styled after. */
  mark: StyledRun;
  paragraphs: TextParagraph[];
}

export interface PageFootnotes {
  notes: Footnote[];
  /** Top of the first note's box and bottom of the last one's, PDF y. */
  top: number;
  bottom: number;
  /** Room between the body's last box and the first note's — what the separator may take. */
  gapPt: number;
  /** How far above the first note's box the separator rule was drawn. */
  risePt: number;
}

export type FootnoteLift =
  | { kind: 'none' }
  /** The page has footnotes, and they stay ordinary paragraphs. */
  | { kind: 'kept' }
  | ({ kind: 'lifted' } & PageFootnotes);

function runsOf(paragraph: TextParagraph): StyledRun[] {
  return paragraph.lines.flatMap((line) => line.cells.flatMap((cell) => cell.runs));
}

function firstBaseline(paragraph: Paragraph): number {
  return paragraph.kind === 'text'
    ? (paragraph.lines[0]?.baseline ?? paragraph.top)
    : paragraph.top;
}

function isBlank(paragraph: Paragraph): boolean {
  return paragraph.kind === 'text' && paragraph.lines.length === 0;
}

/** The number a raised run prints, when a number is all it prints. */
function markOf(run: StyledRun | undefined): number | null {
  if (run === undefined || run.superscript !== true || run.hidden) return null;
  const match = MARK.exec(run.text);
  return match === null ? null : Number(match[1]);
}

function opensNote(paragraph: Paragraph): number | null {
  return paragraph.kind === 'text' ? markOf(runsOf(paragraph)[0]) : null;
}

function underlines(rule: LayoutRule, paragraphs: readonly Paragraph[]): boolean {
  return paragraphs.some(
    (paragraph) =>
      paragraph.kind === 'text' &&
      paragraph.lines.some(
        (line) =>
          line.baseline >= rule.rect.y &&
          line.baseline - rule.rect.y <= UNDERLINE_REACH &&
          line.x < rule.rect.x + rule.rect.width &&
          line.right > rule.rect.x
      )
  );
}

/** The rule above the page's footnotes: short, thin, with a numbered note right under it. */
function separatorOf(layout: PageLayout, paragraphs: readonly Paragraph[]): LayoutRule | null {
  const found = layout.rules.filter(({ rect }) => {
    if (rect.height > SEPARATOR_MAX_HEIGHT) return false;
    if (rect.width < SEPARATOR_MIN_WIDTH || rect.width > SEPARATOR_MAX_WIDTH) return false;
    // An empty numbered line (Word's own numbering) is not what the rule stands over.
    const below = paragraphs.find(
      (paragraph) => !isBlank(paragraph) && firstBaseline(paragraph) < rect.y
    );
    if (below === undefined || below.kind !== 'text' || opensNote(below) === null) return false;
    const reach = SEPARATOR_REACH * (below.lines[0]?.sizePt ?? 12);
    return rect.y - firstBaseline(below) <= reach && !underlines({ rect }, paragraphs);
  });
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** The paragraphs under the rule as notes, or null when they do not read as notes numbered from `next`. */
function notesOf(under: readonly Paragraph[], next: number): Footnote[] | null {
  const notes: Footnote[] = [];
  for (const paragraph of under) {
    if (paragraph.kind !== 'text' || runsOf(paragraph).some((run) => run.hidden)) return null;
    const number = opensNote(paragraph);
    const open = notes.at(-1);
    const mark = runsOf(paragraph)[0];
    if (number === next + notes.length && mark !== undefined) {
      notes.push({ id: number, mark: { ...mark }, paragraphs: [paragraph] });
    }
    // A second paragraph of the same note; one before any mark was carried over from the last page.
    else if (number === null && open !== undefined) open.paragraphs.push(paragraph);
    else return null;
  }
  return notes.length === 0 ? null : notes;
}

/** Each note's one reference in the text above the rule, or null when any has none or several. */
function referencesOf(body: readonly Paragraph[], notes: readonly Footnote[]): StyledRun[] | null {
  const marks = body.flatMap((paragraph) =>
    paragraph.kind === 'text' ? runsOf(paragraph).filter((run) => markOf(run) !== null) : []
  );
  const references: StyledRun[] = [];
  for (const note of notes) {
    const [reference, ...others] = marks.filter((run) => markOf(run) === note.id);
    if (reference === undefined || others.length > 0) return null;
    references.push(reference);
  }
  return references;
}

/** Word's footnote writes the number itself: the printed one comes off the note's first run. */
function withoutPrintedMark(note: Footnote): void {
  const cell = note.paragraphs[0]?.lines[0]?.cells[0];
  const run = cell?.runs[0];
  if (cell === undefined || run === undefined) return;
  run.text = run.text.replace(/^\s*\d+/, '');
  if (run.text === '') cell.runs.shift();
  // The space after the mark was set at the mark's small size; raised, Word would shrink it again.
  else if (run.text.trim() === '') delete run.superscript;
}

function bottomOf(paragraph: Paragraph): number {
  if (paragraph.kind === 'image') return paragraph.image.rect.y;
  if (paragraph.kind === 'table') return paragraph.bottom;
  const last = paragraph.lines.at(-1);
  if (last === undefined) return paragraph.top - paragraph.leadingPt;
  return last.baseline - (1 - BASELINE_SHARE) * paragraph.leadingPt;
}

/** The notes' own spacing, as the page had it: the first starts the footnote area, the rest follow. */
function settleNotes(build: PageBuild, notes: readonly Footnote[]): TextParagraph[] {
  const paragraphs = notes.flatMap((note) => note.paragraphs);
  settlePage({ ...build, columns: [paragraphs], pleading: null }, Number.POSITIVE_INFINITY);
  const [first] = paragraphs;
  if (first !== undefined) first.spaceBeforePt = 0;
  return paragraphs;
}

function topOf(paragraph: TextParagraph | undefined): number {
  if (paragraph === undefined) return 0;
  return firstBaseline(paragraph) + BASELINE_SHARE * paragraph.leadingPt;
}

/** True when the page sets footnotes under a separator, whether or not they can be lifted. */
export function hasFootnotes(build: PageBuild, layout: PageLayout): boolean {
  return separatorOf(layout, build.columns.flat()) !== null;
}

interface Pairing {
  body: Paragraph[];
  notes: Footnote[];
  references: StyledRun[];
}

/** The notes under the rule, each with its one reference above it — or null when they cannot be lifted. */
function pairingOf(column: readonly Paragraph[], ruleY: number, next: number): Pairing | null {
  const under = column.filter((paragraph) => firstBaseline(paragraph) < ruleY);
  const body = column.filter((paragraph) => !under.includes(paragraph));
  const notes = notesOf(under, next);
  const references = notes === null ? null : referencesOf(body, notes);
  if (notes === null || references === null || body.length === 0) return null;
  // Too little room for Word's separator: lifted, the body's last line would leave the page.
  const room = Math.min(...body.map(bottomOf)) - topOf(notes[0]?.paragraphs[0]);
  return room < SEPARATOR_ROOM ? null : { body, notes, references };
}

/**
 * Takes the page's footnotes out of its flow and marks their references, when
 * every note pairs with one mark and the first is numbered `next`. Word's own
 * line numbering counts body lines only, so a page whose printed numbers ran
 * beside its notes keeps them as paragraphs.
 */
export function liftFootnotes(build: PageBuild, layout: PageLayout, next: number): FootnoteLift {
  const [column] = build.columns;
  const separator = separatorOf(layout, build.columns.flat());
  if (column === undefined || separator === null) return { kind: 'none' };
  if (build.columns.length !== 1 || build.pleading?.grid === false) return { kind: 'kept' };
  const pairing = pairingOf(column, separator.rect.y, next);
  if (pairing === null) return { kind: 'kept' };
  const { body, notes, references } = pairing;
  references.forEach((run, index) => {
    run.footnote = notes[index]?.id ?? 0;
  });
  notes.forEach(withoutPrintedMark);
  build.columns[0] = body;
  const settled = settleNotes(build, notes);
  const top = topOf(settled[0]);
  const bottom = Math.min(...settled.map(bottomOf));
  const risePt = separator.rect.y + separator.rect.height / 2 - top;
  const gapPt = Math.min(...body.map(bottomOf)) - top;
  return { kind: 'lifted', notes, top, bottom, gapPt, risePt };
}

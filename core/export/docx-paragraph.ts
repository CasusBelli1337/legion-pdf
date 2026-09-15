/**
 * From the model's paragraphs to the docx package's. The one place the docx
 * API is spoken for body text: exact line spacing in twips, indents in twips,
 * runs carrying the Word font name, half-point size, bold, italic, colour,
 * underline. Pictures are docx-image.ts's, ruled tables docx-table.ts's.
 *
 * Lines of one paragraph are JOINED into flowing text — that is the whole
 * point of exporting to Word — with a hyphen at a line's end healed when the
 * next line continues the word.
 */

import {
  AlignmentType,
  ColumnBreak,
  LeaderType,
  LineRuleType,
  PageNumber,
  Paragraph as DocxParagraph,
  Tab,
  TabStopType,
  TextRun,
} from 'docx';
import type { IParagraphOptions, IRunOptions } from 'docx';
import type { LayoutFont } from '@shared/types';
import { sameStyle } from './lines';
import type { Alignment, Line, StyledRun, TextParagraph } from './model';
import { twips } from './model';
import { halfPoints, runStyleFor } from './styles';

/**
 * A run whose text contains this shows the current page number — a Word PAGE
 * field, so the numbers keep counting as the attorney edits. Control
 * characters, so no real text can collide with it.
 */
export const PAGE_FIELD = '\u0000PAGE\u0000';

export const ALIGNMENT: Record<Alignment, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

type Fonts = Readonly<Record<string, LayoutFont>>;

const UNNAMED_FONT: LayoutFont = { name: '', family: 'serif', bold: false, italic: false };

/** What a scan's recognised text is set in: the OCR layer's own face is a placeholder. */
const RECOGNIZED_FONT = 'Times New Roman';

function runOptions(run: StyledRun, fonts: Fonts): IRunOptions {
  const style = runStyleFor(fonts[run.fontKey] ?? UNNAMED_FONT);
  return {
    font: run.hidden ? RECOGNIZED_FONT : style.wordFont,
    size: halfPoints(run.sizePt),
    bold: style.bold,
    italics: style.italic,
    color: run.colorHex,
    ...(run.underline ? { underline: {} } : {}),
    ...(run.superscript === true ? { superScript: true } : {}),
  };
}

/** Text with PAGE_FIELD inside it becomes text, a page-number field, text. */
function pieces(text: string): (string | typeof PageNumber.CURRENT)[] {
  return text
    .split(PAGE_FIELD)
    .flatMap((part, index) => (index === 0 ? [part] : [PageNumber.CURRENT, part]))
    .filter((part) => part !== '');
}

/** One TextRun per hard line break, so a "\n" in the text becomes a Word line break. */
function textRun(run: StyledRun, fonts: Fonts): TextRun[] {
  const options = runOptions(run, fonts);
  return run.text
    .split('\n')
    .map(
      (part, index) =>
        new TextRun({ ...options, ...(index > 0 ? { break: 1 } : {}), children: pieces(part) })
    );
}

/** Adds a run to the flow, merging it into the last one when the style is the same. */
function flow(joined: StyledRun[], run: StyledRun): void {
  const previous = joined.at(-1);
  if (previous !== undefined && sameStyle(previous, run)) previous.text += run.text;
  else joined.push({ ...run });
}

/**
 * Prefixes that keep their hyphen at a line's end: "self-" + "employed" is
 * "self-employed", not "selfemployed". Config over code — a new one is a row.
 */
const HYPHENATED_PREFIXES =
  /(^|[^a-z])(self|non|pre|post|anti|co|cross|well|half|ex|multi|semi|sub|over|under|out|off|re|de|pro|quasi|vice|all|full|long|short|high|low|one|two|three|first|second|third|mid|inter|intra|extra|pseudo|so|mother|father|sister|brother)-$/i;

/**
 * A word broken at the line's end was hyphenated by the typesetter unless the
 * hyphen is one the word owns: a compound that already has a hyphen
 * ("meet-and-" + "confer") or a prefix that takes one.
 */
export function healsHyphen(previous: string, next: string): boolean {
  if (!/[a-z]-$/.test(previous) || !/^[a-z]/.test(next)) return false;
  const word = previous.slice(previous.lastIndexOf(' ') + 1);
  if (word.slice(0, -1).includes('-')) return false;
  return !HYPHENATED_PREFIXES.test(word);
}

/** A run's first word, in points, from its share of the line. */
function firstWordWidth(line: Line): number {
  const cell = line.cells[0];
  const run = cell?.runs[0];
  if (cell === undefined || run === undefined || run.text.length === 0) return 0;
  const chars = cell.runs.reduce((sum, entry) => sum + entry.text.length, 0);
  const word = run.text.trimStart().split(/\s/)[0] ?? '';
  return chars === 0 ? 0 : ((line.right - line.x) * word.length) / chars;
}

/**
 * A line that stopped short of the paragraph's edge by more than the next
 * line's first word was broken on purpose — an address block typed with
 * Shift+Enter — and Word must break there too, not flow the lines together.
 */
export function breaksHard(line: Line, next: Line, widest: number): boolean {
  return line.right + 0.25 * line.sizePt + firstWordWidth(next) < widest;
}

/**
 * "signa-" + "ture" → "signature"; a deliberate break stays a break; otherwise
 * lines meet at a space. Every line of a centred block was broken on purpose
 * — a court's name over its county, a two-line heading — so centred lines
 * always break.
 */
export function joinLines(lines: readonly Line[], alignment: Alignment = 'left'): StyledRun[] {
  const joined: StyledRun[] = [];
  const widest = Math.max(...lines.map((line) => line.right));
  // Geometry already ends an untagged paragraph at a short line; only a tagged
  // paragraph can hold a short line that was broken on purpose. OCR'd text is
  // never tagged, and its ragged right edges would read as breaks.
  const tagged = lines.every((line) => line.blockId !== null);
  lines.forEach((line, index) => {
    const runs = line.cells.flatMap((cell) => cell.runs);
    const previous = joined.at(-1);
    const next = runs[0];
    const above = lines[index - 1];
    if (previous !== undefined && next !== undefined && above !== undefined) {
      if (healsHyphen(previous.text, next.text)) previous.text = previous.text.slice(0, -1);
      else if (alignment === 'center' || (tagged && breaksHard(above, line, widest))) {
        previous.text += '\n';
      } else if (!previous.text.endsWith(' ')) previous.text += ' ';
    }
    for (const run of runs) flow(joined, run);
  });
  return joined;
}

/** A tabular line: cells separated by tabs, each cell's runs kept. */
function tabbedChildren(line: Line, fonts: Fonts): TextRun[] {
  return line.cells.flatMap((cell, index) => {
    const runs = cell.runs.flatMap((run) => textRun(run, fonts));
    if (index === 0) return runs;
    const first = cell.runs[0];
    const tab = new TextRun({ ...(first ? runOptions(first, fonts) : {}), children: [new Tab()] });
    return [tab, ...runs];
  });
}

function childrenOf(paragraph: TextParagraph, fonts: Fonts): TextRun[] {
  if (paragraph.tabStops.length > 0) {
    // Tabbed lines keep their line ends: a table-of-contents entry that wrapped
    // before its leader must wrap there in Word too, or the tab lands elsewhere.
    return paragraph.lines.flatMap((line, index) => [
      ...(index > 0 ? [new TextRun({ break: 1 })] : []),
      ...tabbedChildren(line, fonts),
    ]);
  }
  return joinLines(paragraph.lines, paragraph.alignment).flatMap((run) => textRun(run, fonts));
}

function indentOf(paragraph: TextParagraph): IParagraphOptions['indent'] | undefined {
  const { indentLeftPt, indentRightPt, firstLinePt } = paragraph;
  if (indentLeftPt === 0 && indentRightPt === 0 && firstLinePt === 0) return undefined;
  return {
    left: twips(indentLeftPt),
    right: twips(indentRightPt),
    ...(firstLinePt > 0 ? { firstLine: twips(firstLinePt) } : {}),
    ...(firstLinePt < 0 ? { hanging: twips(-firstLinePt) } : {}),
  };
}

export interface ParagraphPlacement {
  pageBreakBefore: boolean;
  /** A rule drawn against the paragraph, e.g. the line above a pleading's footer. */
  border?: IParagraphOptions['border'];
}

/** A column break run ahead of the children when the paragraph opens column two. */
export function withColumnBreak<T>(paragraph: { columnBreakBefore?: boolean }, children: T[]) {
  return paragraph.columnBreakBefore === true ? [new ColumnBreak(), ...children] : children;
}

export function docxTextParagraph(
  paragraph: TextParagraph,
  fonts: Fonts,
  placement: ParagraphPlacement
): DocxParagraph {
  const indent = indentOf(paragraph);
  return new DocxParagraph({
    alignment: ALIGNMENT[paragraph.alignment],
    spacing: {
      line: twips(paragraph.leadingPt),
      lineRule: LineRuleType.EXACT,
      before: twips(paragraph.spaceBeforePt),
      after: 0,
    },
    ...(indent === undefined ? {} : { indent }),
    tabStops: paragraph.tabStops.map((stop) => ({
      type: stop.align === 'right' ? TabStopType.RIGHT : TabStopType.LEFT,
      position: twips(stop.positionPt),
      ...(stop.leader === 'dot' ? { leader: LeaderType.DOT } : {}),
    })),
    pageBreakBefore: placement.pageBreakBefore,
    ...(placement.border === undefined ? {} : { border: placement.border }),
    // Word's line numbering counts every paragraph line; a spacer is not one.
    ...(paragraph.spacer === true ? { suppressLineNumbers: true } : {}),
    children: withColumnBreak(paragraph, childrenOf(paragraph, fonts)),
  });
}

/**
 * A firm's slug in the margin beside the foot ("ACME LLP / ATTORNEYS AT LAW /
 * SAN JOSE", three tiny lines left of the line numbers) shares its height with
 * the footer's own lines. Stacked into the footer's flow it makes the footer
 * taller than the page left room for, and Word takes the difference out of the
 * body: the last two numbered lines of every page spill onto a page of their
 * own. Each slug line is therefore a frame placed on the paper where it sat —
 * a frame adds nothing to the footer's height.
 */

import { FrameAnchorType, FrameWrap, HeightRule, LineRuleType, Paragraph, TextRun } from 'docx';
import type { LayoutFont, LayoutTextRun } from '@shared/types';
import { BASELINE_SHARE, twips } from './model';
import type { BodyFrame, Line, StyledRun } from './model';
import { halfPoints, runStyleFor } from './styles';

type Fonts = Readonly<Record<string, LayoutFont>>;

/** A run must end this far left of the body's left edge to count as set in the margin. */
const MARGIN_GAP = 2;
/** A slug line's box, × its size. */
const SLUG_LEADING = 1.2;
/** Word's face may run wider than the PDF's: room (× width, then points) before the line would wrap. */
const WIDTH_SHARE = 1.5;
const WIDTH_PAD = 6;

/** Set wholly in the left margin, clear of the body's left edge. */
export function isMarginRun(run: LayoutTextRun, frame: BodyFrame): boolean {
  return run.x + run.width <= frame.left - MARGIN_GAP;
}

/** The band's runs: those set in the left margin, and the rest. */
export function splitMarginRuns(
  runs: readonly LayoutTextRun[],
  frame: BodyFrame
): { margin: LayoutTextRun[]; main: LayoutTextRun[] } {
  const margin = runs.filter((run) => isMarginRun(run, frame));
  // A lone margin run with nothing beside it is an ordinary outdented foot.
  if (margin.length === runs.length) return { margin: [], main: [...runs] };
  return { margin, main: runs.filter((run) => !isMarginRun(run, frame)) };
}

/** Rough advance widths (× size): Word's letter-spaced capitals run wider than the PDF's small caps. */
const SPACE_EM = 0.25;
const CAPITAL_EM = 0.68;
const OTHER_EM = 0.5;
/** Headroom on the estimate, and the narrowest the letters are ever squeezed (per cent). */
const ESTIMATE_SLACK = 1.1;
const MIN_SCALE = 50;

function estimatedWidth(text: string, sizePt: number): number {
  let ems = 0;
  for (const char of text) {
    ems += char === ' ' ? SPACE_EM : /[A-Z0-9]/.test(char) ? CAPITAL_EM : OTHER_EM;
  }
  return ems * sizePt;
}

/** The line's runs in reading order, a space between cells. */
function runsOf(line: Line): StyledRun[] {
  return line.cells.flatMap((cell, index) =>
    index === 0 || cell.runs[0] === undefined
      ? cell.runs
      : [{ ...cell.runs[0], text: ` ${cell.runs[0].text}` }, ...cell.runs.slice(1)]
  );
}

/** Character scaling (per cent) that keeps the line inside `roomPt` in Word's face. */
export function slugScale(runs: readonly StyledRun[], roomPt: number): number {
  const estimate = runs.reduce((sum, run) => sum + estimatedWidth(run.text, run.sizePt), 0);
  if (estimate * ESTIMATE_SLACK <= roomPt) return 100;
  return Math.max(MIN_SCALE, Math.floor((100 * roomPt) / (estimate * ESTIMATE_SLACK)));
}

/** One slug line as a paragraph in a frame at its own place on the paper. */
export function slugParagraph(
  line: Line,
  fonts: Fonts,
  frame: BodyFrame,
  pageHeight: number
): Paragraph {
  const leadingPt = Math.max(1, SLUG_LEADING * line.sizePt);
  const natural = line.right - line.x;
  const roomy = Math.min(WIDTH_SHARE * natural + WIDTH_PAD, frame.left - MARGIN_GAP / 2 - line.x);
  const widthPt = Math.max(natural + MARGIN_GAP, roomy);
  const runs = runsOf(line);
  const scale = slugScale(runs, widthPt - MARGIN_GAP);
  return new Paragraph({
    spacing: { line: twips(leadingPt), lineRule: LineRuleType.EXACT, before: 0, after: 0 },
    frame: {
      type: 'absolute',
      position: {
        x: twips(line.x),
        y: twips(pageHeight - (line.baseline + BASELINE_SHARE * leadingPt)),
      },
      width: twips(widthPt),
      height: twips(leadingPt),
      rule: HeightRule.EXACT,
      wrap: FrameWrap.AROUND,
      anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
    },
    children: runs.map((run) => {
      const font = fonts[run.fontKey];
      const style = font === undefined ? null : runStyleFor(font);
      return new TextRun({
        text: run.text,
        size: halfPoints(run.sizePt),
        ...(style === null
          ? {}
          : { font: style.wordFont, bold: style.bold, italics: style.italic }),
        ...(scale === 100 ? {} : { scale }),
      });
    }),
  });
}

/**
 * How much narrower than Word's own face a line of the PDF was set. A scan's
 * recognised words carry the width of the scan's word boxes, and some
 * producers condense their type (PDF horizontal scaling); set at full width in
 * Word such a line runs 4–6% longer than it was, its last word wraps, every
 * line becomes two, and a 16-page order comes out as 31. Word's character
 * scaling (Font ▸ Advanced ▸ Scale) sets the line exactly as wide as it was.
 *
 * Widths come from the standard faces' metrics (pdf-lib's AFM tables): Times
 * New Roman, Arial and Courier New were cut to the widths of Times, Helvetica
 * and Courier. A line in any other face is left alone — a guess at its widths
 * would squeeze text that was never condensed.
 */

import { StandardFontEmbedder } from 'pdf-lib';
import type { LayoutFont } from '@shared/types';
import type { Cell, Line, StyledRun } from './model';
import { halfPoints, runStyleFor } from './styles';

type Fonts = Readonly<Record<string, LayoutFont>>;
type Embedder = ReturnType<typeof StandardFontEmbedder.for>;

/** Visible type is scaled only when plainly condensed; a hair's difference is the producer's rounding. */
const VISIBLE_THRESHOLD = 0.97;
/** Never squeeze below this (per cent): narrower than that the measurement is wrong, not the type. */
const MIN_SCALE = 60;
/** A cell shorter than this (points) says too little about its own width. */
const MIN_WIDTH = 24;

const FAMILIES: readonly { test: RegExp; faces: readonly [string, string, string, string] }[] = [
  { test: /times/i, faces: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'] },
  {
    test: /arial|helvetica/i,
    faces: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  },
  {
    test: /courier/i,
    faces: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
  },
];

const embedders = new Map<string, Embedder>();

function embedderFor(face: string): Embedder {
  const known = embedders.get(face);
  if (known !== undefined) return known;
  const made = StandardFontEmbedder.for(face as Parameters<typeof StandardFontEmbedder.for>[0]);
  embedders.set(face, made);
  return made;
}

/**
 * The standard face cut to the same widths as the run's Word font, or null
 * when there is none. Recognised text is always set in Times New Roman
 * (docx-paragraph.ts), in the weight and slant the OCR layer's face carried.
 */
function faceOf(run: StyledRun, fonts: Fonts): string | null {
  const font = fonts[run.fontKey];
  if (font === undefined) return run.hidden ? 'Times-Roman' : null;
  const style = runStyleFor(font);
  const family = run.hidden
    ? FAMILIES[0]
    : FAMILIES.find((entry) => entry.test.test(style.wordFont));
  return family?.faces[(style.bold ? 1 : 0) + (style.italic ? 2 : 0)] ?? null;
}

/** The width Word would give the runs at full scale, or null when it cannot be told. */
function wordWidth(runs: readonly StyledRun[], fonts: Fonts): number | null {
  let width = 0;
  for (const [index, run] of runs.entries()) {
    const face = faceOf(run, fonts);
    if (face === null || run.superscript === true) return null;
    const text = index === runs.length - 1 ? run.text.trimEnd() : run.text;
    try {
      width += embedderFor(face).widthOfTextAtSize(text, halfPoints(run.sizePt) / 2);
    } catch {
      return null; // a character outside the face's encoding: no honest measure
    }
  }
  return width;
}

/**
 * The cell's character scaling, per cent, or null when it needs none: only
 * text whose Word width would exceed the width it had on the page is scaled.
 */
export function cellScale(cell: Cell, fonts: Fonts): number | null {
  const natural = cell.right - cell.x;
  const expected = wordWidth(cell.runs, fonts);
  if (expected === null || natural < MIN_WIDTH || expected <= 0) return null;
  const ratio = natural / expected;
  const threshold = cell.runs.every((run) => run.hidden) ? 1 : VISIBLE_THRESHOLD;
  if (ratio >= threshold) return null;
  const scale = Math.max(MIN_SCALE, Math.floor(ratio * 100));
  return scale >= 100 ? null : scale;
}

/** The lines again, each condensed cell's runs carrying its scale. */
export function withLineScales(lines: readonly Line[], fonts: Fonts): Line[] {
  return lines.map((line) => ({
    ...line,
    cells: line.cells.map((cell) => {
      const scalePct = cellScale(cell, fonts);
      if (scalePct === null) return cell;
      return { ...cell, runs: cell.runs.map((run) => ({ ...run, scalePct })) };
    }),
  }));
}

/**
 * The numbers that make what the attorney types on screen land exactly where
 * the engine puts it in the file.
 *
 * The renderer cannot import `core/` (zone rule: `src → shared ← electron →
 * core`), so the three faces' metrics are restated here from the same Adobe AFM
 * data pdf-lib embeds. They are constants of the PDF standard fonts, not our
 * numbers, and `font-metrics.test.ts` holds a drift-guard against the engine's
 * line spacing so the two can never quietly disagree.
 *
 * Screen fonts are chosen for METRIC COMPATIBILITY, not looks: Arial/Liberation
 * Sans share Helvetica's advance widths, Times New Roman/Liberation Serif share
 * Times', Courier New/Liberation Mono share Courier's. That is what lets the
 * browser wrap a line in the same place pdf-lib will.
 */

import type { TextFontChoice } from '@shared/types';

export type TextFamily = TextFontChoice['family'];

/** Ascender and descender per 1000 units — identical across a family's styles. */
interface FaceMetrics {
  ascender: number;
  descender: number;
  /** Screen stand-ins, most metric-compatible first. */
  cssStack: string;
}

const FACES: Record<TextFamily, FaceMetrics> = {
  helvetica: {
    ascender: 718,
    descender: -207,
    cssStack: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  },
  times: {
    ascender: 683,
    descender: -217,
    cssStack: "'Times New Roman', Times, 'Liberation Serif', serif",
  },
  courier: {
    ascender: 629,
    descender: -157,
    cssStack: "'Courier New', Courier, 'Liberation Mono', monospace",
  },
};

/** Must equal `LINE_SPACING` in core/stamps/text-box.ts. Guarded by test. */
export const LINE_SPACING = 1.15;

/** Height of one line's text box — ascender to descender, as pdf-lib measures it. */
export function fontHeightPt(family: TextFamily, sizePt: number): number {
  const face = FACES[family];
  return ((face.ascender - face.descender) / 1000) * sizePt;
}

/** How far the baseline sits below the top of that box. */
export function ascentPt(family: TextFamily, sizePt: number): number {
  return (FACES[family].ascender / 1000) * sizePt;
}

/** Baseline-to-baseline distance, exactly as the engine steps between lines. */
export function lineStepPt(family: TextFamily, sizePt: number): number {
  return fontHeightPt(family, sizePt) * LINE_SPACING;
}

export function cssFontStack(family: TextFamily): string {
  return FACES[family].cssStack;
}

/** A CSS `font` shorthand for one face — what the textarea and the ruler share. */
export function cssFontShorthand(font: TextFontChoice, sizePx: number): string {
  const style = font.italic === true ? 'italic ' : '';
  const weight = font.bold === true ? '700 ' : '400 ';
  return `${style}${weight}${sizePx}px ${cssFontStack(font.family)}`;
}

/** Plain English for one face, for receipts and the font-match note. */
export function familyLabel(font: TextFontChoice): string {
  const names: Record<TextFamily, string> = {
    helvetica: 'Helvetica',
    times: 'Times',
    courier: 'Courier',
  };
  const styles = [font.bold === true ? 'bold' : null, font.italic === true ? 'italic' : null]
    .filter((part): part is string => part !== null)
    .join(' ');
  return styles === '' ? names[font.family] : `${names[font.family]} ${styles}`;
}

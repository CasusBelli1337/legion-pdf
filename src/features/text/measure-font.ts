/**
 * How tall the SCREEN font actually is, asked of the browser rather than
 * assumed. CSS half-leading is computed from the screen face's ascent and
 * descent, so the overlay cannot land its baseline on the engine's baseline
 * without knowing them.
 *
 * Measured once per face at a big probe size and normalised per pixel, so the
 * answer is reused at every zoom level.
 */

import type { TextFontChoice } from '@shared/types';
import { cssFontShorthand } from './font-metrics';
import type { FontBox } from './text-geometry';

const PROBE_PX = 100;
const cache = new Map<string, FontBox | null>();

function measure(shorthand: string): FontBox | null {
  if (typeof document === 'undefined') return null;
  const context = document.createElement('canvas').getContext('2d');
  if (context === null) return null;
  context.font = shorthand;
  const metrics = context.measureText('Hxg');
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = metrics;
  if (typeof ascent !== 'number' || typeof descent !== 'number') return null;
  if (!(ascent > 0) || !(descent >= 0)) return null;
  return { ascent: ascent / PROBE_PX, descent: descent / PROBE_PX };
}

/** The face's ascent and descent per 1px of font size, or null if unmeasurable. */
export function fontBoxFor(font: TextFontChoice): FontBox | null {
  const shorthand = cssFontShorthand(font, PROBE_PX);
  const known = cache.get(shorthand);
  if (known !== undefined) return known;
  const measured = measure(shorthand);
  cache.set(shorthand, measured);
  return measured;
}

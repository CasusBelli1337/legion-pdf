/**
 * Hex colours from the panel, turned into pdf-lib colours. A colour the user
 * cannot see the effect of is worse than a refusal, so a malformed value throws
 * in plain English instead of silently painting black.
 */

import { rgb } from 'pdf-lib';
import type { RGB } from 'pdf-lib';
import { PRODUCT_NAME } from '@shared/product';

const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export const BLACK = rgb(0, 0, 0);
export const WHITE = rgb(1, 1, 1);
/** The default watermark grey — light enough to read the page through it. */
export const WATERMARK_GREY = '#808080';

function channel(value: string): number {
  return Number.parseInt(value.length === 1 ? `${value}${value}` : value, 16) / 255;
}

/** "#808080" or "#888" to a pdf-lib colour. Anything else is a loud error. */
export function parseHexColor(hex: string, label = 'colour'): RGB {
  const match = LONG_HEX.exec(hex.trim()) ?? SHORT_HEX.exec(hex.trim());
  const [, red, green, blue] = match ?? [];
  if (red === undefined || green === undefined || blue === undefined) {
    throw new RangeError(
      `"${hex}" is not a ${label} ${PRODUCT_NAME} understands — write it as #RRGGBB, for example #808080.`
    );
  }
  return rgb(channel(red), channel(green), channel(blue));
}

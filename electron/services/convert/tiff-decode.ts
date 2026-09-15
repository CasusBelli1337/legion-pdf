/**
 * Multi-page TIFF, the format fax servers and document scanners still hand
 * attorneys, taken apart page by page.
 *
 * A PDF cannot carry TIFF, so each page is decoded to RGBA and re-encoded as a
 * PNG with the repo's own encoder — the same one redaction rebuilds pages with,
 * so there is one PNG writer in the product rather than two. The re-encode
 * throws the resolution away, so the TIFF's own DPI is read out of the tags here
 * and carried alongside the bytes; otherwise a 200 DPI fax would come out as an
 * arbitrarily sized page.
 */

import { createRequire } from 'node:module';
import type * as Utif from 'utif';
import type { IFD } from 'utif';
import { encodeRgbPng, toOpaqueRgb } from '@core/redact';
import type { PdfImageSource } from '@core/ops';
import { ConvertFailedError } from './types';

// utif is CommonJS with a single `module.exports`, so an ESM named import comes
// back undefined. createRequire is how the rest of main-process code (see
// pdf-intake.ts) reaches packages like that.
const require = createRequire(import.meta.url);
const UTIF = require('utif') as typeof Utif;

/** TIFF resolution unit: 2 = inch, 3 = centimetre, 1 = no unit at all. */
const CENTIMETRES_PER_INCH = 2.54;

function tagNumber(ifd: IFD, tag: string): number | null {
  const value = ifd[tag];
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = typeof first === 'string' ? Number(first) : first;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function densityOfIfd(ifd: IFD): { x: number; y: number } | undefined {
  const x = tagNumber(ifd, 't282');
  const y = tagNumber(ifd, 't283');
  const unit = tagNumber(ifd, 't296') ?? 2;
  if (x === null || y === null || (unit !== 2 && unit !== 3)) return undefined;
  const factor = unit === 3 ? CENTIMETRES_PER_INCH : 1;
  return { x: x * factor, y: y * factor };
}

/** Every page of a TIFF, as PNG bytes that keep the original's resolution. */
export function decodeTiffPages(bytes: Uint8Array, fileName: string): PdfImageSource[] {
  const pages = UTIF.decode(Buffer.from(bytes));
  if (pages.length === 0) {
    throw new ConvertFailedError(`${fileName} contains no pages to convert.`);
  }
  return pages.map((ifd, index) => {
    UTIF.decodeImage(Buffer.from(bytes), ifd);
    const rgba = UTIF.toRGBA8(ifd);
    if (ifd.width <= 0 || ifd.height <= 0 || rgba.length !== ifd.width * ifd.height * 4) {
      throw new ConvertFailedError(
        `Page ${index + 1} of ${fileName} could not be decoded — it may use a TIFF ` +
          'compression this converter does not read.'
      );
    }
    const rgb = toOpaqueRgb({
      widthPx: ifd.width,
      heightPx: ifd.height,
      channels: 4,
      samples: rgba,
    });
    const density = densityOfIfd(ifd);
    return {
      name: pages.length === 1 ? fileName : `${fileName} page ${index + 1}`,
      bytes: encodeRgbPng(rgb),
      ...(density === undefined ? {} : { density }),
    };
  });
}

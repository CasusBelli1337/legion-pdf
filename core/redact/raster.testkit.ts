/**
 * TEST SUPPORT ONLY — never imported by shipping code.
 *
 * Stands in for the renderer's pdfjs canvas. The pixel dimensions follow the
 * same rule the real rasterizer follows (DISPLAY size × DPI ÷ 72, so /Rotate
 * swaps the axes), because a raster whose shape disagrees with the page is
 * exactly what the engine is supposed to reject.
 */

import type { PdfRect } from '@shared/types';
import { displaySize } from '@core/ocr';
import { makePng } from '@core/ocr/png-fixture.testkit';
import { decodePng } from './png-decode';
import type { PageRaster } from './types';

export interface FakeRasterOptions {
  /** Page media/crop box in points. */
  crop: PdfRect;
  rotation?: number;
  dpi?: number;
  /** Paint a black band, so "everything is already black" cannot pass a test. */
  band?: boolean;
}

/** A page raster the burn pipeline accepts, sized like the real thing. */
export function fakePageRaster(options: FakeRasterOptions): PageRaster {
  const dpi = options.dpi ?? 300;
  const display = displaySize(options.rotation ?? 0, options.crop);
  const widthPx = Math.max(1, Math.round((display.width * dpi) / 72));
  const heightPx = Math.max(1, Math.round((display.height * dpi) / 72));
  const png = makePng({
    width: widthPx,
    height: heightPx,
    channels: 4,
    paint: (_x, y) =>
      options.band === true && y > heightPx / 3 && y < (2 * heightPx) / 3
        ? [40, 40, 40, 255]
        : [255, 255, 255, 255],
  });
  return { png, widthPx, heightPx };
}

/** RGB of one pixel of a PNG — how tests prove a region really went black. */
export function pixelAt(png: Uint8Array, x: number, y: number): [number, number, number] {
  const decoded = decodePng(png);
  const offset = (y * decoded.widthPx + x) * decoded.channels;
  const read = (channel: number): number => decoded.samples[offset + channel] ?? -1;
  return decoded.channels >= 3 ? [read(0), read(1), read(2)] : [read(0), read(0), read(0)];
}

/**
 * A patch of a page as a PNG, on the renderer's canvas — for handwriting
 * (ink-regions.ts), which is neither text nor a picture in the PDF and can
 * only be carried into Word as what the page shows there.
 */

import type { PdfRect } from '@shared/types';
import type { RasterizedImage, RegionDrawer } from './extract-page-layout';

/** Fine enough that a signature's hairlines survive; a patch is small, so the pixels are cheap. */
export const INK_DPI = 200;
const SCALE = INK_DPI / 72;

interface ViewportLike {
  convertToViewportPoint(x: number, y: number): number[];
}

export interface RenderablePage {
  getViewport(parameters: { scale: number }): ViewportLike;
  render(parameters: {
    canvas: null;
    canvasContext: CanvasRenderingContext2D;
    viewport: ViewportLike;
    transform: number[];
  }): { promise: Promise<unknown> };
}

interface PixelBox {
  left: number;
  top: number;
  widthPx: number;
  heightPx: number;
}

/** The patch in canvas pixels: whole pixels, never empty. */
export function pixelBoxOf(rect: PdfRect, viewport: ViewportLike): PixelBox {
  const [x0 = 0, y0 = 0] = viewport.convertToViewportPoint(rect.x, rect.y);
  const [x1 = 0, y1 = 0] = viewport.convertToViewportPoint(
    rect.x + rect.width,
    rect.y + rect.height
  );
  const left = Math.floor(Math.min(x0, x1));
  const top = Math.floor(Math.min(y0, y1));
  return {
    left,
    top,
    widthPx: Math.max(1, Math.ceil(Math.max(x0, x1)) - left),
    heightPx: Math.max(1, Math.ceil(Math.max(y0, y1)) - top),
  };
}

/** The patch's size without its pixels (the export preview only needs to know a picture is there). */
export function measureRegionOf(page: RenderablePage): RegionDrawer {
  return (rect) => {
    const { widthPx, heightPx } = pixelBoxOf(rect, page.getViewport({ scale: SCALE }));
    return Promise.resolve({ png: new Uint8Array(0), widthPx, heightPx });
  };
}

export function drawRegionOf(page: RenderablePage): RegionDrawer {
  return async (rect): Promise<RasterizedImage | null> => {
    const viewport = page.getViewport({ scale: SCALE });
    const { left, top, widthPx, heightPx } = pixelBoxOf(rect, viewport);
    const canvas = new OffscreenCanvas(widthPx, heightPx);
    const context = canvas.getContext('2d');
    if (context === null) return null;
    await page.render({
      canvas: null,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      transform: [1, 0, 0, 1, -left, -top],
    }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const png = new Uint8Array(await blob.arrayBuffer());
    return png.byteLength === 0 ? null : { png, widthPx, heightPx };
  };
}

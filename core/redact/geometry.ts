/**
 * Where a marked rectangle lands in the raster's pixels, and where the burned
 * raster lands back on the page.
 *
 * Three coordinate systems meet here, exactly as they do in the OCR lane:
 * PDF USER space (bottom-left origin, points, ignores /Rotate), DISPLAY space
 * (what pdfjs rasterized — the crop box already turned by /Rotate), and PIXELS
 * (top-left origin, the image Tesseract and pdf-lib see). The rotation table
 * below is the only place the turn is expressed; everything else is a scale.
 *
 * Pixel rectangles always round OUTWARD. A mark that covers 99% of a pixel must
 * black out that whole pixel: under-covering by half a pixel at 300 DPI is a
 * legible sliver of a letter, and legible is the failure mode that ends careers.
 */

import type { PageSize, PdfRect } from '@shared/types';
import { displaySize, displayToUserMatrix, normalizeRotation, rasterScale } from '@core/ocr';
import { RedactionGeometryError } from './types';
import type { PixelRect } from './types';

/** How far the raster's shape may drift from the page's before it is suspect. */
const ASPECT_TOLERANCE = 0.02;

type DisplayMapper = (rect: PdfRect, crop: PdfRect) => PdfRect;

/**
 * User-space rectangle → display-space rectangle, per /Rotate. Config over
 * code: a table of four mappings rather than a branch tree, so each turn can be
 * read (and tested) on its own line.
 */
const TO_DISPLAY: Record<0 | 90 | 180 | 270, DisplayMapper> = {
  0: (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }),
  90: (rect, crop) => ({
    x: rect.y,
    y: crop.width - rect.x - rect.width,
    width: rect.height,
    height: rect.width,
  }),
  180: (rect, crop) => ({
    x: crop.width - rect.x - rect.width,
    y: crop.height - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  }),
  270: (rect, crop) => ({
    x: crop.height - rect.y - rect.height,
    y: rect.x,
    width: rect.height,
    height: rect.width,
  }),
};

/**
 * A PDF user-space rectangle in the display space the rasterizer worked in.
 * The crop box origin is subtracted first, so pages whose box does not start at
 * (0,0) map as correctly as the ordinary ones.
 */
export function userRectToDisplay(rect: PdfRect, rotation: number, crop: PdfRect): PdfRect {
  const local: PdfRect = {
    x: rect.x - crop.x,
    y: rect.y - crop.y,
    width: rect.width,
    height: rect.height,
  };
  return TO_DISPLAY[normalizeRotation(rotation)](local, crop);
}

/**
 * Display-space rectangle (bottom-left origin, points) → pixels (top-left
 * origin), rounded outward and clamped to the raster. A mark that clamps to
 * nothing never happened, so it throws instead of quietly painting no pixels.
 */
export function displayRectToPixels(
  rect: PdfRect,
  display: PageSize,
  widthPx: number,
  heightPx: number
): PixelRect {
  const { scaleX, scaleY } = rasterScale(display, widthPx, heightPx);
  const left = Math.floor(rect.x / scaleX);
  const right = Math.ceil((rect.x + rect.width) / scaleX);
  const top = Math.floor((display.height - rect.y - rect.height) / scaleY);
  const bottom = Math.ceil((display.height - rect.y) / scaleY);
  const x = Math.max(0, Math.min(widthPx, left));
  const y = Math.max(0, Math.min(heightPx, top));
  const width = Math.max(0, Math.min(widthPx, right) - x);
  const height = Math.max(0, Math.min(heightPx, bottom) - y);
  if (width === 0 || height === 0) {
    throw new RedactionGeometryError(
      'A redaction mark falls outside the page it is attached to, so nothing would be ' +
        'destroyed. Remove the mark and draw it on the page.'
    );
  }
  return { x, y, width, height };
}

/** The whole journey: a mark in PDF user space → the pixels to paint black. */
export function pdfRectToPixels(
  rect: PdfRect,
  rotation: number,
  crop: PdfRect,
  widthPx: number,
  heightPx: number
): PixelRect {
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RedactionGeometryError(
      `A redaction mark has no area (${rect.width} x ${rect.height} points) — ` +
        'it would destroy nothing.'
    );
  }
  const display = displaySize(rotation, crop);
  return displayRectToPixels(userRectToDisplay(rect, rotation, crop), display, widthPx, heightPx);
}

/** Where the burned raster is drawn so the rebuilt page looks like the old one. */
export interface ImagePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Counter-clockwise degrees for pdf-lib, which cancels the page's /Rotate. */
  rotate: 0 | 90 | 180 | 270;
}

/**
 * The rebuilt page keeps its ORIGINAL media box and /Rotate, so page geometry,
 * links, and anything measuring the document still agree with the source. The
 * image therefore has to be drawn pre-turned: anchoring at the display origin
 * and rotating by /Rotate puts the raster back exactly where it was seen.
 */
export function imagePlacement(rotation: number, crop: PdfRect): ImagePlacement {
  const display = displaySize(rotation, crop);
  const matrix = displayToUserMatrix(rotation, crop);
  return {
    x: matrix[4],
    y: matrix[5],
    width: display.width,
    height: display.height,
    rotate: normalizeRotation(rotation),
  };
}

/**
 * A raster of the WRONG page still decodes, still burns, and still embeds — it
 * just replaces a page with a picture of a different one. Comparing shapes
 * catches that before anything is destroyed.
 */
export function assertRasterMatchesPage(
  page: number,
  rotation: number,
  crop: PdfRect,
  widthPx: number,
  heightPx: number
): PageSize {
  const display = displaySize(rotation, crop);
  if (widthPx <= 0 || heightPx <= 0) {
    throw new RedactionGeometryError(`Page ${page} rasterized to ${widthPx}x${heightPx} pixels.`);
  }
  const pageRatio = display.width / display.height;
  const rasterRatio = widthPx / heightPx;
  if (Math.abs(pageRatio - rasterRatio) / pageRatio > ASPECT_TOLERANCE) {
    throw new RedactionGeometryError(
      `Page ${page}: a ${widthPx}x${heightPx} image does not match a ` +
        `${Math.round(display.width)}x${Math.round(display.height)} point page — refusing to ` +
        'rebuild the page from the wrong picture.'
    );
  }
  return display;
}

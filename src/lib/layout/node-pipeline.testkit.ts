/// <reference types="node" />
/**
 * TEST SUPPORT ONLY — the whole layout pipeline under Node: pdfjs' legacy
 * build reads the page, the selection engine classifies it, and the extractor
 * builds the `PageLayout`s core/export consumes. Shared by the fixture test
 * and the Word fidelity suite so both grade the same code the app runs.
 */

import path from 'node:path';
import type { PageLayout, PdfRect } from '@shared/types';
import { createSelectCopyEngine } from '@renderer/features/select-copy/engine';
import { createPdfjsSource } from '@renderer/features/select-copy/pdfjs-source';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike, RasterizedImage } from './extract-page-layout';
import { rolesOf } from './page-roles';
import { darkOfBits, darkOfColour } from './scan-ink';
import { scanRulesOf } from './scan-rules';
import { encodeRgbPng } from './test-png';

const ROOT = path.join(import.meta.dirname, '../../..');
const STANDARD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');
/** The JBIG2 and JPEG 2000 decoders: without them a scan's picture never arrives, as it does in the app. */
const WASM = path.join(ROOT, 'node_modules/pdfjs-dist/wasm/');

interface PdfJsLike {
  OPS: Readonly<Record<string, number>>;
  getDocument(parameters: {
    data: Uint8Array;
    useSystemFonts: boolean;
    standardFontDataUrl: string;
    wasmUrl: string;
    isOffscreenCanvasSupported: boolean;
  }): { promise: Promise<PdfJsDocument> };
}

export interface PdfJsDocument {
  numPages: number;
  getPage(page: number): Promise<unknown>;
  loadingTask: { destroy(): Promise<void> };
}

export async function pdfjs(): Promise<PdfJsLike> {
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
}

export async function openBytes(bytes: Uint8Array): Promise<PdfJsDocument> {
  const { getDocument } = await pdfjs();
  // pdfjs takes the buffer with it; the caller's copy stays whole.
  return getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
    wasmUrl: WASM,
    isOffscreenCanvasSupported: false,
  }).promise;
}

/** pdfjs' ImageKind values: packed 1-bit grey (1 = white), RGB, RGBA. */
const GRAY_1BPP = 1;
const RGB = 2;
const RGBA = 3;

function rgbOfBits(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  const rowBytes = Math.ceil(width / 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bit = ((data[y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
      rgb.fill(bit === 1 ? 255 : 0, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return rgb;
}

function rgbOfColour(data: Uint8ClampedArray, pixels: number, stride: number): Uint8Array {
  const rgb = new Uint8Array(pixels * 3);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    // No alpha in this encoder: a see-through picture (a signature) is laid on white paper.
    const alpha = stride === 4 ? (data[pixel * 4 + 3] ?? 255) / 255 : 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = data[pixel * stride + channel] ?? 0;
      rgb[pixel * 3 + channel] = Math.round(value * alpha + 255 * (1 - alpha));
    }
  }
  return rgb;
}

/** Node has no canvas: pdfjs hands raw pixels, which core's PNG encoder takes. */
export async function rasterizeInNode(image: unknown): Promise<RasterizedImage | null> {
  const { width, height, kind, data } = image as {
    width: number;
    height: number;
    kind?: number;
    data?: Uint8ClampedArray;
  };
  if (data === undefined || (kind !== GRAY_1BPP && kind !== RGB && kind !== RGBA)) return null;
  const bits = kind === GRAY_1BPP;
  const rgb = bits
    ? rgbOfBits(data, width, height)
    : rgbOfColour(data, width * height, kind === RGBA ? 4 : 3);
  const dark = bits
    ? darkOfBits(data, width, height, 0)
    : darkOfColour(data, width, height, kind === RGBA ? 4 : 3);
  return {
    png: encodeRgbPng({ widthPx: width, heightPx: height, rgb }),
    widthPx: width,
    heightPx: height,
    rules: scanRulesOf(dark),
  };
}

/** Every page of the document as the layouts the Word exporter is handed. */
export interface PagePatch {
  page: number;
  /** The page's box, [x0, y0, x1, y1]. */
  view: readonly number[];
  rect: PdfRect;
}

export interface LayoutOptions {
  /** Node has no canvas to draw a patch of page on; the suite hands in poppler (handwriting, ink-regions.ts). */
  drawPatch?: (patch: PagePatch) => Promise<RasterizedImage | null>;
}

export async function layoutsOf(
  bytes: Uint8Array,
  options: LayoutOptions = {}
): Promise<PageLayout[]> {
  const { OPS } = await pdfjs();
  const { drawPatch } = options;
  const document = await openBytes(bytes);
  const engine = createSelectCopyEngine(createPdfjsSource(document as never, 'fixture'));
  const layouts: PageLayout[] = [];
  for (let page = 1; page <= document.numPages; page += 1) {
    const classification = await engine.classifyPage(page);
    const pdfPage = (await document.getPage(page)) as unknown as PageLike;
    layouts.push(
      await extractPageLayout(pdfPage, {
        page,
        ops: OPS as unknown as Readonly<Record<string, number>>,
        roles: rolesOf(classification),
        printedPageNumber: classification.printedPageNumber,
        rasterize: rasterizeInNode,
        ...(drawPatch === undefined
          ? {}
          : { drawRegion: (rect) => drawPatch({ page, view: pdfPage.view, rect }) }),
      })
    );
  }
  await document.loadingTask.destroy();
  return layouts;
}

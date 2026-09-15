/// <reference types="node" />
/**
 * TEST SUPPORT ONLY — the whole layout pipeline under Node: pdfjs' legacy
 * build reads the page, the selection engine classifies it, and the extractor
 * builds the `PageLayout`s core/export consumes. Shared by the fixture test
 * and the Word fidelity suite so both grade the same code the app runs.
 */

import path from 'node:path';
import type { PageLayout } from '@shared/types';
import { createSelectCopyEngine } from '@renderer/features/select-copy/engine';
import { createPdfjsSource } from '@renderer/features/select-copy/pdfjs-source';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike, RasterizedImage } from './extract-page-layout';
import { rolesOf } from './page-roles';
import { encodeRgbPng } from './test-png';

const ROOT = path.join(import.meta.dirname, '../../..');
const STANDARD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');

interface PdfJsLike {
  OPS: Readonly<Record<string, number>>;
  getDocument(parameters: {
    data: Uint8Array;
    useSystemFonts: boolean;
    standardFontDataUrl: string;
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
    isOffscreenCanvasSupported: false,
  }).promise;
}

/** Node has no canvas: pdfjs hands raw pixels, which core's PNG encoder takes. */
export async function rasterizeInNode(image: unknown): Promise<RasterizedImage | null> {
  const { width, height, kind, data } = image as {
    width: number;
    height: number;
    kind?: number;
    data?: Uint8ClampedArray;
  };
  if (data === undefined) return null;
  const rgb = new Uint8Array(width * height * 3);
  const stride = kind === 3 ? 4 : 3;
  if (kind !== 2 && kind !== 3) return null;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb.set(data.subarray(pixel * stride, pixel * stride + 3), pixel * 3);
  }
  return {
    png: encodeRgbPng({ widthPx: width, heightPx: height, rgb }),
    widthPx: width,
    heightPx: height,
  };
}

/** Every page of the document as the layouts the Word exporter is handed. */
export async function layoutsOf(bytes: Uint8Array): Promise<PageLayout[]> {
  const { OPS } = await pdfjs();
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
      })
    );
  }
  await document.loadingTask.destroy();
  return layouts;
}

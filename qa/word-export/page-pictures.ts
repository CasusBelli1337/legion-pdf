/// <reference types="node" />
/**
 * The suite's stand-in for the app's `requestRaster`: poppler draws a picture
 * page whole, as a JPEG at the exporter's own resolution, so a filing with
 * scanned exhibits goes through the same path here as in the app — exhibits
 * are never recognised, and each becomes one picture on a sheet of its own.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildDocx, picturePagesOf } from '@core/export';
import type { DocxBuild, PagePicture } from '@core/export';
import type { RasterizedImage } from '@renderer/lib/layout/extract-page-layout';
import { layoutsOf } from '@renderer/lib/layout/node-pipeline.testkit';
import type { PagePatch } from '@renderer/lib/layout/node-pipeline.testkit';
import { readPdf, recognizeScannedPages } from './ocr';

const run = promisify(execFile);
/** Same as PICTURE_DPI in electron/services/export/page-pictures.ts. */
const DPI = 150;

async function pictureOf(pdfPath: string, page: number, scratch: string): Promise<PagePicture> {
  const prefix = path.join(scratch, `x${page}`);
  const range = ['-f', String(page), '-l', String(page)];
  await run('pdftoppm', ['-r', String(DPI), '-jpeg', ...range, pdfPath, prefix]);
  const name = (await readdir(scratch)).find(
    (file) => file.startsWith(`x${page}-`) && file.endsWith('.jpg')
  );
  if (name === undefined) throw new Error(`pdftoppm wrote no picture for page ${page}`);
  return { data: new Uint8Array(await readFile(path.join(scratch, name))), type: 'jpg' };
}

export async function picturesFor(
  pdfPath: string,
  pages: readonly number[]
): Promise<Map<number, PagePicture>> {
  const pictures = new Map<number, PagePicture>();
  if (pages.length === 0) return pictures;
  const scratch = await mkdtemp(path.join(tmpdir(), 'wx-pic-'));
  for (const page of pages) pictures.set(page, await pictureOf(pdfPath, page, scratch));
  return pictures;
}

/** Same as INK_DPI in src/lib/layout/region-raster.ts. */
const PATCH_DPI = 200;

/** The suite's stand-in for the renderer's canvas: poppler draws one patch of one page. */
function patchDrawer(pdfPath: string): (patch: PagePatch) => Promise<RasterizedImage | null> {
  return async ({ page, view, rect }) => {
    const [x0 = 0, , , y1 = 0] = view;
    const px = (points: number): number => Math.round((points * PATCH_DPI) / 72);
    const size = { widthPx: Math.max(1, px(rect.width)), heightPx: Math.max(1, px(rect.height)) };
    const scratch = await mkdtemp(path.join(tmpdir(), 'wx-ink-'));
    const prefix = path.join(scratch, 'patch');
    const at = ['-x', String(px(rect.x - x0)), '-y', String(px(y1 - rect.y - rect.height))];
    const box = ['-W', String(size.widthPx), '-H', String(size.heightPx)];
    const only = ['-f', String(page), '-l', String(page), '-singlefile'];
    await run('pdftoppm', [
      '-r',
      String(PATCH_DPI),
      '-png',
      ...only,
      ...at,
      ...box,
      pdfPath,
      prefix,
    ]);
    return { png: new Uint8Array(await readFile(`${prefix}.png`)), ...size };
  };
}

export interface Exported {
  build: DocxBuild;
  /** Pages whose text was recognised first. */
  recognized: number[];
  /** Pages kept as pictures. */
  pictures: number[];
}

/** One PDF through the exporter's own steps: exhibits set aside, scans recognised, the .docx built. */
export async function exportLikeTheApp(pdfPath: string, title: string): Promise<Exported> {
  const bytes = await readPdf(pdfPath);
  const drawPatch = patchDrawer(pdfPath);
  const first = await layoutsOf(bytes, { drawPatch });
  const source = await recognizeScannedPages(bytes, pdfPath, picturePagesOf(first));
  const layouts =
    source.recognized.length === 0 ? first : await layoutsOf(source.bytes, { drawPatch });
  const pictures = picturePagesOf(layouts);
  const build = await buildDocx(layouts, {
    title,
    pagePictures: await picturesFor(pdfPath, pictures),
  });
  return { build, recognized: source.recognized, pictures };
}

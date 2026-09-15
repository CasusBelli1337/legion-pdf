/// <reference types="node" />
/**
 * Recognising a scan the way Legion PDF does — poppler rasterises the page,
 * the system Tesseract emits hOCR, core/ocr parses it and writes the invisible
 * text layer — so the corpus's OCR'd fixture and the suite's handling of a
 * bare scan both go through the app's own text-layer writer.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { detectTextLayer, parseHocr, writeTextLayer } from '@core/ocr';
import type { OcrPageWords } from '@core/ocr';

const run = promisify(execFile);
const DPI = 300;
/** Tesseract processes at once: a scanned filing has many pages and this machine has cores. */
const WORKERS = 8;

async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(...(await Promise.all(items.slice(start, start + size).map(work))));
  }
  return out;
}

export function tesseractReachable(): boolean {
  return (process.env.PATH ?? '').split(':').some((dir) => existsSync(path.join(dir, 'tesseract')));
}

async function recognizePage(
  pdfPath: string,
  page: number,
  scratch: string
): Promise<OcrPageWords> {
  const prefix = path.join(scratch, `p${page}`);
  await run('pdftoppm', [
    '-r',
    String(DPI),
    '-gray',
    '-png',
    '-f',
    String(page),
    '-l',
    String(page),
    pdfPath,
    prefix,
  ]);
  const png = (await readdir(scratch)).find(
    (name) => name.startsWith(`p${page}-`) && name.endsWith('.png')
  );
  if (png === undefined) throw new Error(`pdftoppm wrote no PNG for page ${page}`);
  const { stdout } = await run(
    'tesseract',
    [path.join(scratch, png), 'stdout', '-l', 'eng', '--dpi', String(DPI), 'hocr'],
    { maxBuffer: 1 << 26 }
  );
  const parsed = parseHocr(stdout);
  if (parsed.words.length === 0) throw new Error(`Tesseract found no words on page ${page}`);
  return {
    page,
    widthPx: parsed.widthPx,
    heightPx: parsed.heightPx,
    words: parsed.words,
    blank: false,
  };
}

/**
 * The document with a text layer on every page that lacked one — the bytes
 * unchanged when nothing needed recognising. `pdfPath` is where the same bytes
 * live on disk (poppler reads files).
 */
export async function recognizeScannedPages(
  bytes: Uint8Array,
  pdfPath: string
): Promise<{ bytes: Uint8Array; recognized: number[]; wordsPerPage: number[] }> {
  const detected = await detectTextLayer(bytes);
  if (detected.pagesNeedingOcr.length === 0) return { bytes, recognized: [], wordsPerPage: [] };
  const scratch = await mkdtemp(path.join(tmpdir(), 'wx-ocr-'));
  const pages = await inBatches(detected.pagesNeedingOcr, WORKERS, (page) =>
    recognizePage(pdfPath, page, scratch)
  );
  const result = await writeTextLayer(bytes, pages);
  return {
    bytes: result.bytes,
    recognized: result.detail.pagesOcred,
    wordsPerPage: result.detail.wordsPerPage,
  };
}

export async function readPdf(pdfPath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(pdfPath));
}

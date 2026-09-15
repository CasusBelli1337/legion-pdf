/// <reference types="node" />
/**
 * The scanned-page path end to end, with nothing faked but Electron itself:
 * `qa/fixtures/scanned-deposition.pdf` is six pictures of words, the REAL
 * Tesseract reads them, the REAL pdfjs extractor builds the layouts of the
 * recognized copy, and core/export writes the Word file — once per answer to
 * "what about the pictures".
 *
 * The .docx files land in `qa/output/word-export-scan/` (gitignored) so they
 * can be opened in real Word; the assertions here grade what is inside them.
 * Skipped cleanly when the fixture or Tesseract is not on this machine.
 *
 * The renderer's half — pdfjs, the selection engine, the layout extractor — is
 * loaded through `rendererModule` rather than imported by name. The two
 * tsconfigs are composite projects that do not overlap (electron/ has no DOM,
 * src/ has no node), so a static import of renderer source from a main-process
 * test is a typecheck error however it is written. A runtime specifier keeps
 * the module out of the type program and in the test.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { documentXmlOf } from '@core/export';
import type {
  LayoutResponse,
  OcrRunDetail,
  OpResult,
  PageLayout,
  RasterResponse,
  ScanPictureMode,
} from '@shared/types';
import { OcrService } from '../ocr';
import { docxExporter } from './docx-exporter';
import type { ExportContext, ExportJob } from './export-job';

const run = promisify(execFile);
const ROOT = path.join(import.meta.dirname, '../../..');
const FIXTURE = path.join(ROOT, 'qa/fixtures/scanned-deposition.pdf');
const OUTPUT = path.join(ROOT, 'qa/output/word-export-scan');
const STANDARD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');
const TESSERACT = '/usr/bin/tesseract';
const RUNNABLE = existsSync(FIXTURE) && existsSync(TESSERACT) && existsSync('/usr/bin/pdftoppm');

/* ── the renderer's two jobs, done here in plain Node ────────────────────── */

type Rasterize = (image: unknown) => Promise<RasterizedImage | null>;

interface RasterizedImage {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

interface PageClassification {
  printedPageNumber: number | null;
}

interface RendererHalf {
  createSelectCopyEngine(source: unknown): {
    classifyPage(page: number): Promise<PageClassification>;
  };
  createPdfjsSource(document: unknown, docId: string): unknown;
  extractPageLayout(
    page: unknown,
    options: {
      page: number;
      ops: Readonly<Record<string, number>>;
      roles: unknown;
      printedPageNumber: number | null;
      rasterize: Rasterize;
    }
  ): Promise<PageLayout>;
  rolesOf(classification: unknown): unknown;
  encodeRgbPng(image: { widthPx: number; heightPx: number; rgb: Uint8Array }): Uint8Array;
}

/** The renderer's modules, by path at RUN time — see the note at the top. */
async function rendererHalf(): Promise<RendererHalf> {
  const load = async (file: string): Promise<Record<string, unknown>> =>
    (await import(path.join(ROOT, 'src', file))) as Record<string, unknown>;
  const [engine, source, layout, roles, png] = await Promise.all([
    load('features/select-copy/engine.ts'),
    load('features/select-copy/pdfjs-source.ts'),
    load('lib/layout/extract-page-layout.ts'),
    load('lib/layout/page-roles.ts'),
    load('lib/layout/test-png.ts'),
  ]);
  return {
    ...engine,
    ...source,
    ...layout,
    ...roles,
    ...png,
  } as unknown as RendererHalf;
}

interface PdfJsLike {
  OPS: Readonly<Record<string, number>>;
  getDocument(parameters: {
    data: Uint8Array;
    useSystemFonts: boolean;
    standardFontDataUrl: string;
    isOffscreenCanvasSupported: boolean;
  }): { promise: Promise<PdfJsDocument> };
}

interface PdfJsDocument {
  numPages: number;
  getPage(page: number): Promise<unknown>;
  loadingTask: { destroy(): Promise<void> };
}

async function pdfjs(): Promise<PdfJsLike> {
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
}

/** Node has no canvas: pdfjs hands raw pixels, which core's PNG encoder takes. */
function rasterizeWith(half: RendererHalf): Rasterize {
  return async (image: unknown) => {
    const { width, height, kind, data } = image as {
      width: number;
      height: number;
      kind?: number;
      data?: Uint8ClampedArray;
    };
    if (data === undefined || (kind !== 2 && kind !== 3)) return null;
    const rgb = new Uint8Array(width * height * 3);
    const stride = kind === 3 ? 4 : 3;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgb.set(data.subarray(pixel * stride, pixel * stride + 3), pixel * 3);
    }
    return {
      png: half.encodeRgbPng({ widthPx: width, heightPx: height, rgb }),
      widthPx: width,
      heightPx: height,
    };
  };
}

async function layoutOf(bytes: Uint8Array, page: number): Promise<PageLayout> {
  const half = await rendererHalf();
  const { OPS, getDocument } = await pdfjs();
  const document = await getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONTS,
    isOffscreenCanvasSupported: false,
  }).promise;
  const engine = half.createSelectCopyEngine(half.createPdfjsSource(document, 'fixture'));
  const classification = await engine.classifyPage(page);
  const layout = await half.extractPageLayout(await document.getPage(page), {
    page,
    ops: OPS,
    roles: half.rolesOf(classification),
    printedPageNumber: classification.printedPageNumber,
    rasterize: rasterizeWith(half),
  });
  await document.loadingTask.destroy();
  return layout;
}

/** Everything the Word file will show, with the run boundaries taken out. */
function plainTextOf(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');
}

/** A PNG's real size, read out of its IHDR — what the page worker checks against. */
function pngSize(png: Uint8Array): { widthPx: number; heightPx: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { widthPx: view.getUint32(16), heightPx: view.getUint32(20) };
}

/* ── the fake Electron: a temp file per document, poppler for the rasters ── */

class Documents {
  private readonly bytes = new Map<string, Uint8Array>();
  private next = 0;
  constructor(private readonly workspace: string) {}

  async put(id: string, bytes: Uint8Array): Promise<string> {
    this.bytes.set(id, bytes);
    await writeFile(path.join(this.workspace, `${id}.pdf`), bytes);
    return id;
  }

  async adopt(bytes: Uint8Array): Promise<string> {
    this.next += 1;
    return this.put(`adopted-${this.next}`, bytes);
  }

  bytesOf(id: string): Uint8Array {
    const found = this.bytes.get(id);
    if (found === undefined) throw new Error(`No document ${id} — the export read a closed copy.`);
    return found;
  }

  close(id: string): void {
    this.bytes.delete(id);
  }

  async raster(id: string, page: number, dpi: number): Promise<RasterResponse> {
    const prefix = path.join(this.workspace, `${id}-p${page}-${dpi}`);
    await run('/usr/bin/pdftoppm', [
      '-png',
      '-singlefile',
      '-r',
      String(dpi),
      '-f',
      String(page),
      '-l',
      String(page),
      path.join(this.workspace, `${id}.pdf`),
      prefix,
    ]);
    const png = new Uint8Array(await readFile(`${prefix}.png`));
    return { requestId: 'r', png, ...pngSize(png) };
  }
}

function contextFor(documents: Documents, workspace: string): ExportContext {
  const recognizeText = (
    docId: string,
    bytes: Uint8Array,
    pages: readonly number[],
    onProgress: (current: number, total: number) => void
  ): Promise<OpResult<OcrRunDetail>> => {
    const service = new OcrService({
      requestRaster: ({ docId: id, page, dpi }) => documents.raster(id, page, dpi),
      emitProgress: (progress) => onProgress(progress.current, progress.total),
      locate: () => ({ command: TESSERACT, source: 'path', tessdataPrefix: null }),
      cpuCount: () => 6,
      tempRoot: workspace,
    });
    return service.run(docId, bytes, { pages: [...pages], language: 'eng', dpi: 300 });
  };
  return {
    requestRaster: ({ docId, page, dpi }) =>
      documents.raster(docId, page, dpi).then((raster) => ({
        png: raster.png ?? new Uint8Array(),
        widthPx: raster.widthPx,
        heightPx: raster.heightPx,
      })),
    requestLayout: async ({ docId, page }): Promise<LayoutResponse> => ({
      requestId: 'r',
      layout: await layoutOf(documents.bytesOf(docId), page),
    }),
    recognizeText,
    adopt: (bytes) => documents.adopt(bytes),
    closeDoc: (docId) => documents.close(docId),
  };
}

/* ── the run ─────────────────────────────────────────────────────────────── */

let workspace = '';
let documents: Documents;
let source: Uint8Array;

beforeAll(async () => {
  if (!RUNNABLE) return;
  workspace = await mkdtemp(path.join(tmpdir(), 'librarius-scan-export-'));
  documents = new Documents(workspace);
  source = new Uint8Array(await readFile(FIXTURE));
  await documents.put('deposition', source);
  await mkdir(OUTPUT, { recursive: true });
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

async function exportWith(mode: ScanPictureMode) {
  const outputPath = path.join(OUTPUT, `scanned-deposition-${mode}.docx`);
  const phases: string[] = [];
  const job: ExportJob = {
    docId: 'deposition',
    bytes: source,
    fileName: 'scanned-deposition.pdf',
    options: { format: 'docx', outputPath, scanPictures: mode },
    pages: [1, 2, 3, 4, 5, 6],
    signal: new AbortController().signal,
    report: vi.fn((_current: number, _total: number, phase: string) => {
      phases.push(phase);
    }),
  };
  const result = await docxExporter(job, contextFor(documents, workspace));
  return { result, phases, xml: await documentXmlOf(new Uint8Array(await readFile(outputPath))) };
}

describe.skipIf(!RUNNABLE)('a scanned deposition exported to Word', () => {
  it('reads all six pictures of words and keeps them as editable text', async () => {
    const { result, phases, xml } = await exportWith('omit');

    expect(result.pagesExported).toBe(6);
    expect(phases[0]).toBe('Recognizing text on scanned pages');
    expect(phases).toContain('Reading page layout');
    expect(result.receipt?.kept).toHaveLength(6);
    expect(result.receipt?.kept[0]).toMatch(
      /^Page 1 was a scan; its text was recognized \(\d\d% average confidence\) — check names and numbers\.$/
    );
    expect(result.receipt?.dropped.join(' ')).toMatch(/Page 1 is a scan/);
    // Real words read off the pictures, not a placeholder.
    const text = plainTextOf(xml);
    for (let page = 1; page <= 6; page += 1) {
      expect(text.includes(`SCANNED EXHIBIT PAGE ${page}`)).toBe(true);
    }
    expect(text.includes('The quick brown fox jumps over the lazy dog 0123456789.')).toBe(true);
    expect(xml.includes('<wp:anchor')).toBe(false);
  }, 600_000);

  it("'behind' anchors every page's picture behind its recognized text", async () => {
    const { result, xml } = await exportWith('behind');
    expect(xml.match(/<wp:anchor/g)).toHaveLength(6);
    expect(xml.match(/behindDoc="1"/g)).toHaveLength(6);
    expect(xml.includes('<wp:wrapNone')).toBe(true);
    // Nothing was lost, so nothing is reported as left out.
    expect(result.receipt?.dropped).toEqual([]);
  }, 600_000);

  it("'appendix' adds one edge-to-edge sheet per scan after the text", async () => {
    const { result, xml } = await exportWith('appendix');
    expect(xml.includes('Scanned pages')).toBe(true);
    expect(xml.match(/<wp:inline/g)).toHaveLength(6);
    expect(xml.match(/<w:sectPr>/g)?.length).toBe(7);
    expect(result.receipt?.dropped).toEqual([]);
  }, 600_000);
});

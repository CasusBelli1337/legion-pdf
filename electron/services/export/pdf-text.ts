/**
 * pdfjs in the MAIN process, for the plain-text export only.
 *
 * Reading a text layer needs no canvas, so unlike rasterization this does not
 * have to round-trip to the renderer — the legacy Node build of the same engine
 * the viewer uses reads it here. One engine, one answer: what the export writes
 * is exactly what the attorney can select on screen.
 *
 * pdfjs is reached through a hand-written minimal interface so the main-process
 * tsconfig never has to take on DOM types.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import type { TextSource } from './exporter';

interface PdfJsTextItem {
  str?: string;
  /** pdfjs marks the item that ends a line; that is the only newline we trust. */
  hasEOL?: boolean;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: PdfJsTextItem[] }>;
}

interface PdfJsDocument {
  numPages: number;
  getPage(page: number): Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  destroy(): Promise<void>;
}

interface PdfJsParameters {
  data: Uint8Array;
  isEvalSupported: boolean;
  standardFontDataUrl?: string;
}

interface PdfJsModule {
  getDocument(parameters: PdfJsParameters): PdfJsLoadingTask;
}

const resolver = createRequire(import.meta.url);

/**
 * The base-14 font metrics pdfjs needs for documents that embed nothing. Absent
 * in some packaged layouts, and extraction still works without them, so this
 * answers undefined rather than failing the export.
 */
function standardFontsPath(): string | undefined {
  try {
    const directory = join(dirname(resolver.resolve('pdfjs-dist/package.json')), 'standard_fonts');
    return existsSync(directory) ? directory + sep : undefined;
  } catch {
    return undefined;
  }
}

function joinItems(items: readonly PdfJsTextItem[]): string {
  return items.map((item) => (item.str ?? '') + (item.hasEOL === true ? '\n' : '')).join('');
}

/** Opens the document ONCE; the caller asks for pages and then closes it. */
export async function openPdfText(bytes: Uint8Array): Promise<TextSource> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;
  const parameters: PdfJsParameters = { data: new Uint8Array(bytes), isEvalSupported: false };
  const fonts = standardFontsPath();
  if (fonts !== undefined) parameters.standardFontDataUrl = fonts;

  const task = pdfjs.getDocument(parameters);
  const document = await task.promise;
  return {
    async pageText(page: number): Promise<string> {
      if (!Number.isInteger(page) || page < 1 || page > document.numPages) {
        throw new RangeError(
          `Page ${page} is not in this document — it has ${document.numPages} pages.`
        );
      }
      const content = await (await document.getPage(page)).getTextContent();
      return joinItems(content.items);
    },
    close: () => task.destroy(),
  };
}

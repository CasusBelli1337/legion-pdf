/**
 * LANE J's one change to the doc store: `openFile` on a path that is not a PDF.
 *
 * The behaviour that matters is what Save does afterwards. A converted document
 * must arrive UNSAVED with no file behind it, so Ctrl+S raises Save As and a PDF
 * can never be written over the attorney's letter.docx. That is one boolean and
 * one null, and both are easy to regress, so they get their own suite.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { DocStore } from './doc-store';

let workspace = '';

async function pdfBytes(pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([612, 792]);
  return document.save();
}

function storeWithConverter(converted: () => Promise<Uint8Array>): DocStore {
  return new DocStore({
    recentFilePath: join(workspace, 'state', 'recent.json'),
    convertFile: async (filePath) => ({
      bytes: await converted(),
      fileName: `${(filePath.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, '')}.pdf`,
      pageCount: 0,
      engineId: 'stub',
    }),
  });
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-docstore-convert-'));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('DocStore.openFile on a file that is not a PDF', () => {
  it('adopts the conversion as an unsaved document named after the original', async () => {
    const store = storeWithConverter(() => pdfBytes(4));

    const session = await store.openFile('/matters/ashford/letter.docx');

    expect(session.fileName).toBe('letter.pdf');
    expect(session.filePath).toBeNull();
    expect(session.dirty).toBe(true);
    expect(session.pageCount).toBe(4);
  });

  it('refuses Save, so the original file cannot be written over', async () => {
    const store = storeWithConverter(() => pdfBytes(1));
    const session = await store.openFile('/matters/ashford/letter.docx');

    await expect(store.save(session.id)).rejects.toThrow(/no file on disk yet — use Save As/i);
  });

  it('records the original in the recent list, so it can be opened again', async () => {
    const store = storeWithConverter(() => pdfBytes(1));
    await store.openFile('/matters/ashford/exhibit-a.png');

    expect(store.recent().map((entry) => entry.fileName)).toEqual(['exhibit-a.png']);
  });

  it('counts the pages of the conversion itself, not what the engine claimed', async () => {
    // The stub reports pageCount 0; the store re-counts the bytes it was given.
    const store = storeWithConverter(() => pdfBytes(7));

    expect((await store.openFile('/scan.tiff')).pageCount).toBe(7);
  });

  it('never calls the converter for a real PDF', async () => {
    const store = new DocStore({
      recentFilePath: join(workspace, 'state', 'recent.json'),
      readPdf: () => pdfBytes(2),
      convertFile: () => Promise.reject(new Error('a PDF must not be converted')),
    });

    const session = await store.openFile('/matters/brief.PDF');

    expect(session.pageCount).toBe(2);
    expect(session.dirty).toBe(false);
    expect(session.filePath).toBe('/matters/brief.PDF');
  });
});

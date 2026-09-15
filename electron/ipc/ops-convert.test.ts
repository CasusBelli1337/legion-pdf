/**
 * LANE J's one change to `ops:merge`: a source path that is not a PDF.
 *
 * Combine Files is where an attorney drops a PDF brief and a folder of scans
 * together, so the file list is mixed by design. The count is the whole point —
 * a converted source that contributed nothing would still produce a perfectly
 * valid combined PDF, just a shorter one — so this drives the REAL handler over
 * a real doc store and proves the pages add up.
 *
 * `ipcMain` does not exist in this environment, so it is stubbed just far enough
 * to capture the handler the module registers and call it.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makePng } from '@core/ocr/png-fixture.testkit';
import type { MergeDetail, MergeOptions, OpResult } from '@shared/types';
import { DocStore } from '../services/doc-store';
import type { IpcContext } from './context';

type MergeHandler = (event: unknown, options: MergeOptions) => Promise<OpResult<MergeDetail>>;

const handlers = new Map<string, MergeHandler>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: MergeHandler) => handlers.set(channel, handler),
  },
}));

const { registerOpsHandlers } = await import('./ops');

let workspace = '';
let store: DocStore;

async function seedPdf(name: string, pages: number): Promise<string> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([612, 792]);
  const filePath = join(workspace, name);
  await writeFile(filePath, await document.save());
  return filePath;
}

async function seedPng(name: string): Promise<string> {
  const filePath = join(workspace, name);
  await writeFile(
    filePath,
    makePng({ width: 100, height: 140, channels: 3, paint: (x, y) => [x, y, 90] })
  );
  return filePath;
}

function merge(options: MergeOptions): Promise<OpResult<MergeDetail>> {
  const handler = handlers.get('ops:merge');
  if (handler === undefined) throw new Error('ops:merge was never registered.');
  return handler(null, options);
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-merge-convert-'));
  store = new DocStore({ recentFilePath: join(workspace, 'state', 'recent.json') });
  const context: IpcContext = {
    store,
    getWindow: () => null,
    emitProgress: () => undefined,
    requestRaster: () => Promise.reject(new Error('no renderer in this suite')),
    requestLayout: () => Promise.reject(new Error('no renderer in this suite')),
  };
  registerOpsHandlers(context);
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

describe('ops:merge with a mixed list of PDFs and pictures', () => {
  it('converts the pictures on the way in and the page counts add up', async () => {
    const brief = await seedPdf('brief.pdf', 3);
    const scan = await seedPng('exhibit-a.png');
    const exhibits = await seedPdf('exhibits.pdf', 2);

    const result = await merge({
      sources: [{ filePath: brief }, { filePath: scan }, { filePath: exhibits }],
      preserveBookmarks: false,
    });

    expect(result.detail.perSourcePages).toEqual([3, 1, 2]);
    expect(result.pagesIn).toBe(6);
    expect(result.pagesOut).toBe(6);
    expect(store.session(result.detail.docId).pageCount).toBe(6);
  });

  it('combines pictures alone into one document, one page each', async () => {
    const first = await seedPng('scan-1.png');
    const second = await seedPng('scan-2.png');

    const result = await merge({
      sources: [{ filePath: first }, { filePath: second }],
      preserveBookmarks: false,
    });

    expect(result.pagesOut).toBe(2);
  });

  it('refuses a file type it cannot open, by name, instead of skipping it', async () => {
    const brief = await seedPdf('another-brief.pdf', 1);
    const odd = join(workspace, 'archive.xyz');
    await writeFile(odd, 'not a document');

    await expect(
      merge({ sources: [{ filePath: brief }, { filePath: odd }], preserveBookmarks: false })
    ).rejects.toThrow(/cannot open \.xyz files/i);
  });
});

/**
 * The .txt half of the text engine, against real files. The .html half is a
 * hidden Chromium window, which does not exist in Node — it is verified in the
 * real app (docs/references/convert-to-pdf.md).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { TEXT_ENGINE } from './text-engine';

let workspace = '';

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-text-engine-'));
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

async function convert(name: string, contents: string): Promise<Uint8Array> {
  const filePath = join(workspace, name);
  await writeFile(filePath, contents, 'utf8');
  return TEXT_ENGINE.run({ filePath, fileName: name, extension: '.txt' });
}

describe('the built-in text converter', () => {
  it('is available on every computer', async () => {
    expect(await TEXT_ENGINE.available()).toBe(true);
  });

  it('lays a short note out on one Letter page', async () => {
    const bytes = await convert('proof.txt', 'Served by mail, 15 September 2026.');
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(1);
    expect(document.getPages()[0]?.getSize()).toEqual({ width: 612, height: 792 });
  });

  it('paginates a long file rather than losing the tail of it', async () => {
    const contents = Array.from({ length: 300 }, (_value, index) => `Entry ${index + 1}`).join(
      '\n'
    );
    const document = await PDFDocument.load(await convert('log.txt', contents));

    expect(document.getPageCount()).toBeGreaterThan(5);
  });

  it('refuses a file far too large to lay out, and says why', async () => {
    const filePath = join(workspace, 'huge.txt');
    await writeFile(filePath, 'x'.repeat(21 * 1024 * 1024), 'utf8');

    await expect(
      TEXT_ENGINE.run({ filePath, fileName: 'huge.txt', extension: '.txt' })
    ).rejects.toThrow(/too large to lay out/i);
  });
});

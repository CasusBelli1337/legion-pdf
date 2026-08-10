import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { DocStore, UnknownDocumentError } from './doc-store';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return doc.save();
}

let workDir = '';
let store: DocStore;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-docstore-'));
  store = new DocStore({ recentFilePath: join(workDir, 'state', 'recent.json') });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function seedFile(name: string, pages: number): Promise<string> {
  const filePath = join(workDir, name);
  await writeFile(filePath, await makePdf(pages));
  return filePath;
}

describe('DocStore.openFile', () => {
  it('reads bytes, counts pages, and returns a clean session', async () => {
    const filePath = await seedFile('brief.pdf', 4);
    const session = await store.openFile(filePath);

    expect(session.fileName).toBe('brief.pdf');
    expect(session.filePath).toBe(filePath);
    expect(session.pageCount).toBe(4);
    expect(session.dirty).toBe(false);
    expect(session.bytes.byteLength).toBeGreaterThan(0);
  });

  it('records the file in the recent list', async () => {
    const filePath = await seedFile('exhibit.pdf', 1);
    await store.openFile(filePath);
    expect(store.recent().map((entry) => entry.filePath)).toEqual([filePath]);
  });

  it('refuses an empty file rather than opening a 0-page document', async () => {
    const filePath = join(workDir, 'empty.pdf');
    await writeFile(filePath, new Uint8Array(0));
    await expect(store.openFile(filePath)).rejects.toThrow(/0 bytes/);
  });
});

describe('DocStore.adopt', () => {
  it('registers pathless bytes as dirty from birth', async () => {
    const session = await store.adopt(await makePdf(3), 'Combined.pdf');
    expect(session.filePath).toBeNull();
    expect(session.dirty).toBe(true);
    expect(session.pageCount).toBe(3);
  });
});

describe('DocStore.setBytes', () => {
  it('swaps bytes, re-counts pages, and marks dirty', async () => {
    const session = await store.openFile(await seedFile('src.pdf', 2));
    const updated = await store.setBytes(session.id, await makePdf(5));

    expect(updated.pageCount).toBe(5);
    expect(updated.dirty).toBe(true);
    expect(store.bytes(session.id).byteLength).toBe(updated.bytes.byteLength);
  });

  it('rejects an empty byte array instead of silently storing nothing', async () => {
    const session = await store.openFile(await seedFile('src.pdf', 2));
    await expect(store.setBytes(session.id, new Uint8Array(0))).rejects.toThrow(/empty result/);
    expect(store.session(session.id).pageCount).toBe(2);
  });

  it('throws UnknownDocumentError for an unknown id', async () => {
    await expect(store.setBytes('nope', await makePdf(1))).rejects.toBeInstanceOf(
      UnknownDocumentError
    );
  });
});

describe('DocStore.save / saveTo', () => {
  it('writes the current bytes over the original path and clears dirty', async () => {
    const filePath = await seedFile('original.pdf', 2);
    const session = await store.openFile(filePath);
    await store.setBytes(session.id, await makePdf(6));

    const result = await store.save(session.id);

    expect(result.filePath).toBe(filePath);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(store.session(session.id).dirty).toBe(false);
    expect((await readFile(filePath)).byteLength).toBe(result.byteLength);
  });

  it('leaves no temp files behind after an atomic write', async () => {
    const filePath = await seedFile('original.pdf', 2);
    const session = await store.openFile(filePath);
    await store.save(session.id);

    const leftovers = (await readdir(workDir)).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('saveTo retargets the document and records the new path as recent', async () => {
    const session = await store.adopt(await makePdf(2), 'Untitled.pdf');
    const target = join(workDir, 'Produced.pdf');

    await store.saveTo(session.id, target);

    const after = store.session(session.id);
    expect(after.filePath).toBe(target);
    expect(after.fileName).toBe('Produced.pdf');
    expect(after.dirty).toBe(false);
    expect(store.recent()[0]?.filePath).toBe(target);
  });

  it('refuses to save a document that has never had a path', async () => {
    const session = await store.adopt(await makePdf(1), 'Untitled.pdf');
    await expect(store.save(session.id)).rejects.toThrow(/Save As/);
  });
});

describe('DocStore bookkeeping', () => {
  it('lists open documents without their bytes', async () => {
    await store.openFile(await seedFile('a.pdf', 1));
    await store.openFile(await seedFile('b.pdf', 2));

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.every((entry) => !('bytes' in entry))).toBe(true);
  });

  it('close removes the document and later reads throw', async () => {
    const session = await store.openFile(await seedFile('a.pdf', 1));
    store.close(session.id);

    expect(store.has(session.id)).toBe(false);
    expect(() => store.session(session.id)).toThrow(UnknownDocumentError);
  });
});

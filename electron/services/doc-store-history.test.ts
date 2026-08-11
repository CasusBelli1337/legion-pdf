/**
 * Undo/redo over the doc store — the history the attorney actually steps
 * through. Kept beside doc-store.test.ts rather than inside it so the history
 * lane owns a file of its own.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { UNDO_DEPTH } from './doc-history';
import { DocStore, UnknownDocumentError } from './doc-store';

async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) doc.addPage([612, 792]);
  return doc.save();
}

let workDir = '';
let store: DocStore;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-history-'));
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

/** A two-page document that has had a five-page version stamped over it. */
async function openAndEdit(): Promise<{ docId: string; original: Uint8Array }> {
  const session = await store.openFile(await seedFile('brief.pdf', 2));
  const original = store.bytes(session.id);
  await store.setBytes(session.id, await makePdf(5));
  return { docId: session.id, original };
}

describe('stepping back through an edit', () => {
  it('restores the previous bytes and page count', async () => {
    const { docId, original } = await openAndEdit();

    const result = await store.undo(docId);

    expect(result.applied).toBe(true);
    expect(store.bytes(docId)).toBe(original);
    expect(store.session(docId).pageCount).toBe(2);
  });

  it('reports a no-op instead of an error when there is nothing to undo', async () => {
    const session = await store.openFile(await seedFile('brief.pdf', 2));

    const result = await store.undo(session.id);

    expect(result).toEqual({ applied: false, canUndo: false, canRedo: false });
    expect(store.session(session.id).pageCount).toBe(2);
  });

  it('offers a redo of the version that was stepped away from', async () => {
    const { docId } = await openAndEdit();
    const edited = store.bytes(docId);

    await store.undo(docId);
    expect(store.undoState(docId)).toEqual({ canUndo: false, canRedo: true });

    const redo = await store.redo(docId);

    expect(redo).toEqual({ applied: true, canUndo: true, canRedo: false });
    expect(store.bytes(docId)).toBe(edited);
    expect(store.session(docId).pageCount).toBe(5);
  });

  it('reports a no-op when there is nothing to redo', async () => {
    const { docId } = await openAndEdit();
    expect(await store.redo(docId)).toEqual({ applied: false, canUndo: true, canRedo: false });
  });

  it('walks back through every edit, most recent first', async () => {
    const session = await store.openFile(await seedFile('brief.pdf', 1));
    await store.setBytes(session.id, await makePdf(3));
    await store.setBytes(session.id, await makePdf(7));

    await store.undo(session.id);
    expect(store.session(session.id).pageCount).toBe(3);
    await store.undo(session.id);
    expect(store.session(session.id).pageCount).toBe(1);
    expect(await store.undo(session.id)).toMatchObject({ applied: false });
  });

  it('throws for a document that is not open', async () => {
    await expect(store.undo('nope')).rejects.toBeInstanceOf(UnknownDocumentError);
    await expect(store.redo('nope')).rejects.toBeInstanceOf(UnknownDocumentError);
    expect(() => store.undoState('nope')).toThrow(UnknownDocumentError);
  });
});

describe('history limits and invalidation', () => {
  it(`keeps ${UNDO_DEPTH} steps and drops the oldest`, async () => {
    const session = await store.openFile(await seedFile('brief.pdf', 1));
    for (let edit = 0; edit < UNDO_DEPTH + 2; edit += 1) {
      await store.setBytes(session.id, await makePdf(2));
    }

    for (let step = 0; step < UNDO_DEPTH; step += 1) {
      expect(await store.undo(session.id)).toMatchObject({ applied: true });
    }

    expect(await store.undo(session.id)).toMatchObject({ applied: false });
    // The two oldest versions fell off, so the 1-page original is gone with them.
    expect(store.session(session.id).pageCount).toBe(2);
  });

  it('drops the redo stack when a new edit lands after an undo', async () => {
    const { docId } = await openAndEdit();
    await store.undo(docId);
    expect(store.undoState(docId).canRedo).toBe(true);

    await store.setBytes(docId, await makePdf(9));

    expect(store.undoState(docId)).toEqual({ canUndo: true, canRedo: false });
    expect(await store.redo(docId)).toMatchObject({ applied: false });
  });

  it('forgets the history when the document is closed', async () => {
    const { docId } = await openAndEdit();
    store.close(docId);
    expect(() => store.undoState(docId)).toThrow(UnknownDocumentError);
  });
});

describe('history across a save', () => {
  it('survives the save — the edits before it are still there to step back', async () => {
    const filePath = await seedFile('brief.pdf', 2);
    const session = await store.openFile(filePath);
    await store.setBytes(session.id, await makePdf(5));

    await store.save(session.id);

    expect(store.undoState(session.id).canUndo).toBe(true);
    expect(await store.undo(session.id)).toMatchObject({ applied: true });
    expect(store.session(session.id).pageCount).toBe(2);
  });

  // Undoing back onto what is on disk means there is nothing unsaved left, so
  // the close guard must not ask about "unsaved changes" that were stepped out of.
  it('reports the document as clean once it is back on the saved version', async () => {
    const { docId } = await openAndEdit();
    expect(store.session(docId).dirty).toBe(true);

    await store.undo(docId);
    expect(store.session(docId).dirty).toBe(false);

    await store.redo(docId);
    expect(store.session(docId).dirty).toBe(true);
  });
});

/**
 * A restore that quietly produced an empty or unreadable document would be the
 * exact silent data loss undo exists to prevent, so it fails loudly — and the
 * check runs before the history moves, so the step can be tried again.
 */
describe('restore sanity', () => {
  /** Page counts handed back in call order: open, edit, restore. */
  function storeCounting(counts: readonly number[]): DocStore {
    const queue = [...counts];
    return new DocStore({
      recentFilePath: join(workDir, 'state', 'recent.json'),
      countPages: async () => queue.shift() ?? 1,
    });
  }

  it('refuses a restore that would land on a 0-page document', async () => {
    const guarded = storeCounting([2, 5, 0]);
    const session = await guarded.openFile(await seedFile('brief.pdf', 2));
    const edited = await makePdf(5);
    await guarded.setBytes(session.id, edited);

    await expect(guarded.undo(session.id)).rejects.toThrow(/0-page/);
    // Untouched: same bytes, same page count, and the step is still on offer.
    expect(guarded.bytes(session.id)).toBe(edited);
    expect(guarded.session(session.id).pageCount).toBe(5);
    expect(guarded.undoState(session.id)).toEqual({ canUndo: true, canRedo: false });
  });

  it('refuses a restore whose bytes cannot be read at all', async () => {
    let call = 0;
    const guarded = new DocStore({
      recentFilePath: join(workDir, 'state', 'recent.json'),
      countPages: async () => {
        call += 1;
        if (call === 3) throw new Error('The file is damaged.');
        return call;
      },
    });
    const session = await guarded.openFile(await seedFile('brief.pdf', 2));
    const edited = await makePdf(5);
    await guarded.setBytes(session.id, edited);

    await expect(guarded.undo(session.id)).rejects.toThrow(/damaged/);
    expect(guarded.bytes(session.id)).toBe(edited);
    expect(guarded.undoState(session.id)).toEqual({ canUndo: true, canRedo: false });
  });
});

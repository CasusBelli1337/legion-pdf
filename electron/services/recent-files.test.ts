import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecentFilesStore } from './recent-files';

let workDir = '';
let storePath = '';

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-recent-'));
  storePath = join(workDir, 'nested', 'recent.json');
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('RecentFilesStore', () => {
  it('starts empty when no file exists', () => {
    expect(new RecentFilesStore(storePath).list()).toEqual([]);
  });

  it('creates the directory and persists across instances', () => {
    new RecentFilesStore(storePath).record('/cases/ashford/motion.pdf');
    expect(new RecentFilesStore(storePath).list()).toEqual([
      expect.objectContaining({ filePath: '/cases/ashford/motion.pdf', fileName: 'motion.pdf' }),
    ]);
  });

  it('moves a re-opened file to the front without duplicating it', () => {
    const store = new RecentFilesStore(storePath);
    store.record('/a.pdf');
    store.record('/b.pdf');
    const list = store.record('/a.pdf');

    expect(list.map((entry) => entry.filePath)).toEqual(['/a.pdf', '/b.pdf']);
  });

  it('caps the list at the configured maximum', () => {
    const store = new RecentFilesStore(storePath, 3);
    for (const name of ['/1.pdf', '/2.pdf', '/3.pdf', '/4.pdf']) store.record(name);

    expect(store.list().map((entry) => entry.filePath)).toEqual(['/4.pdf', '/3.pdf', '/2.pdf']);
  });

  it('reads a corrupt file as empty instead of throwing', async () => {
    const flatPath = join(workDir, 'recent.json');
    await writeFile(flatPath, '{ this is not json');
    expect(new RecentFilesStore(flatPath).list()).toEqual([]);
  });

  it('drops entries that do not match the RecentFile shape', async () => {
    const flatPath = join(workDir, 'recent.json');
    await writeFile(flatPath, JSON.stringify([{ nope: true }, { filePath: 1 }]));
    expect(new RecentFilesStore(flatPath).list()).toEqual([]);
  });

  it('clear empties the list', () => {
    const store = new RecentFilesStore(storePath);
    store.record('/a.pdf');
    expect(store.clear()).toEqual([]);
    expect(store.list()).toEqual([]);
  });
});

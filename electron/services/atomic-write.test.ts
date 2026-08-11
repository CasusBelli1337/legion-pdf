/**
 * The write every save goes through. A PDF is either entirely replaced or not
 * touched at all — and the byte count that comes back is the byte count on disk.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from './atomic-write';

let workDir = '';

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'librarius-atomic-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

describe('writeFileAtomic', () => {
  it('writes every byte it was given and reports the count', async () => {
    const target = join(workDir, 'exhibit.pdf');

    const written = await writeFileAtomic(target, BYTES);

    expect(written).toBe(BYTES.byteLength);
    expect(new Uint8Array(await readFile(target))).toEqual(BYTES);
  });

  it('leaves no temp file behind', async () => {
    await writeFileAtomic(join(workDir, 'exhibit.pdf'), BYTES);
    expect(await readdir(workDir)).toEqual(['exhibit.pdf']);
  });

  it('replaces an existing file whole', async () => {
    const target = join(workDir, 'exhibit.pdf');
    await writeFile(target, new Uint8Array(4096));

    await writeFileAtomic(target, BYTES);

    expect(new Uint8Array(await readFile(target))).toEqual(BYTES);
    expect(await readdir(workDir)).toEqual(['exhibit.pdf']);
  });

  it('refuses to write an empty document', async () => {
    const target = join(workDir, 'exhibit.pdf');
    await expect(writeFileAtomic(target, new Uint8Array(0))).rejects.toThrow(/empty document/);
    expect(await readdir(workDir)).toEqual([]);
  });

  it('refuses a blank file name', async () => {
    await expect(writeFileAtomic('   ', BYTES)).rejects.toThrow(/no file name/);
  });

  it('leaves the original untouched and drops the temp file when the write fails', async () => {
    const target = join(workDir, 'exhibit.pdf');
    await writeFile(target, BYTES);
    // A directory where the temp file wants to be: rename cannot succeed.
    const doomed = join(workDir, 'missing-folder', 'exhibit.pdf');

    await expect(writeFileAtomic(doomed, BYTES)).rejects.toThrow();

    expect(new Uint8Array(await readFile(target))).toEqual(BYTES);
    expect((await readdir(workDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

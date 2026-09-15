/**
 * Scratch space for the conversions that have to go through a file on disk
 * (Office writes a PDF; Chromium loads an HTML page). Every one of them is
 * wrapped so the directory is removed in a `finally` — a failed conversion must
 * not leave a copy of a client's document sitting in the temp folder.
 *
 * `os.tmpdir()` rather than `app.getPath('temp')` on purpose: on Windows they
 * are the same folder, and staying off the Electron `app` object keeps this file
 * (and everything built on it) testable in plain Node.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTempDir<T>(
  prefix: string,
  work: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), `legion-pdf-${prefix}-`));
  try {
    return await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

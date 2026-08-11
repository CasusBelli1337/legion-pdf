/**
 * One PDF write, used by every path that puts bytes on disk: Save, Save As,
 * `file:saveTo`, and the bulk OCR run.
 *
 * Atomic on purpose. A half-written PDF over the attorney's exhibit is
 * unrecoverable, so the bytes land in a temp file in the SAME directory (rename
 * is only atomic within a filesystem) and are renamed over the target once they
 * are all there. A failure removes the temp file and leaves the target as it
 * was; an empty result is refused rather than written.
 */

import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { rename, unlink, writeFile } from 'node:fs/promises';

/** Bytes written. Throws — never writes an empty or partial file. */
export async function writeFileAtomic(filePath: string, bytes: Uint8Array): Promise<number> {
  if (filePath.trim().length === 0) {
    throw new Error('Cannot save: no file name was given.');
  }
  if (bytes.byteLength === 0) {
    throw new Error(`Refusing to write an empty document to ${basename(filePath)}.`);
  }
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return bytes.byteLength;
}

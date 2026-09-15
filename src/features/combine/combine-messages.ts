/**
 * Turning what went wrong into something an attorney can act on.
 *
 * A combine reads files off disk, so its most likely failure is a file that has
 * been moved, renamed, or unplugged with the network drive since Explorer
 * listed it. Node reports that as "ENOENT: no such file or directory, open
 * '...'", which tells the attorney nothing and looks like a crash.
 */

import { fileNameOf } from './combine-list';

const IPC_WRAPPER = /^Error invoking remote method '[^']+':\s*/;
const MISSING_FILE = /ENOENT: no such file or directory, open '([^']+)'/;

export function plainError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error))
    .replace(IPC_WRAPPER, '')
    .replace(/^Error:\s*/, '');
  const missing = MISSING_FILE.exec(raw);
  if (missing === null) return raw;
  return `Could not find ${fileNameOf(missing[1] ?? '')}. It may have been moved or renamed since it was added to the list.`;
}

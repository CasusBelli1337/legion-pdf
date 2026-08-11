/**
 * Files the OS hands the app: a double-clicked PDF in Explorer, a file dropped
 * on the app icon, or a path on the command line.
 *
 * Two pure-ish pieces, both unit-testable without Electron:
 *
 *   `pdfPathsFromArgv` — Windows hands the paths over as ordinary argv entries
 *   (already split, so a path with spaces arrives as ONE entry). Everything that
 *   is not a .pdf is junk to us: the executable itself, Chromium switches, the
 *   dev-mode app directory. Filtering by extension keeps dev and production on
 *   the same code path.
 *
 *   `OpenFilesRelay` — the first batch arrives before the renderer exists, so
 *   paths are queued until the window reports it has loaded and then flushed in
 *   arrival order. Dropping them (the obvious bug) means a double-clicked PDF
 *   opens an empty app.
 */

import { posix, win32 } from 'node:path';
import type { OpenFilesEvent } from '@shared/types';

/**
 * Which path grammar the argv is written in. Injected so the Windows shapes
 * this feature exists for (`C:\Matters\Ashford\dep.pdf`) can be tested on a
 * Linux runner; production always gets the platform's own.
 */
export type PathFlavor = Pick<typeof win32, 'extname' | 'isAbsolute' | 'resolve'>;

const NATIVE: PathFlavor = process.platform === 'win32' ? win32 : posix;

/**
 * The PDF paths in one argv, absolute and de-duplicated, in the order given.
 * `workingDirectory` is what a relative path is resolved against — Electron
 * hands the second instance's own cwd to the `second-instance` listener.
 */
export function pdfPathsFromArgv(
  argv: readonly string[],
  workingDirectory: string,
  flavor: PathFlavor = NATIVE
): string[] {
  const paths: string[] = [];
  for (const argument of argv.slice(1)) {
    // A switch is never a file, even one that carries a .pdf value.
    if (argument.startsWith('-') || flavor.extname(argument).toLowerCase() !== '.pdf') continue;
    const absolute = flavor.isAbsolute(argument)
      ? argument
      : flavor.resolve(workingDirectory, argument);
    if (!paths.includes(absolute)) paths.push(absolute);
  }
  return paths;
}

type Deliver = (event: OpenFilesEvent) => void;

/** Holds OS file opens until the renderer is loaded, then hands them straight on. */
export class OpenFilesRelay {
  private queued: string[] = [];
  private deliver: Deliver | null = null;

  /** Queue (or pass straight through) paths the OS just handed us. */
  offer(paths: readonly string[]): void {
    if (paths.length === 0) return;
    this.queued.push(...paths);
    this.flush();
  }

  /**
   * The renderer is loaded and listening. Call on every `did-finish-load`: a
   * reload re-arms the sink, and anything queued since goes out immediately.
   */
  ready(deliver: Deliver): void {
    this.deliver = deliver;
    this.flush();
  }

  /** The window went away; queue again rather than push into a dead renderer. */
  suspend(): void {
    this.deliver = null;
  }

  private flush(): void {
    if (this.deliver === null || this.queued.length === 0) return;
    const paths = this.queued;
    this.queued = [];
    this.deliver({ paths });
  }
}

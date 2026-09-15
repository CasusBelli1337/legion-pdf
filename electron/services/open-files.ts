/**
 * Files the OS hands the app: a double-clicked PDF in Explorer, a file dropped
 * on the app icon, a path on the command line, or Explorer's "Combine in Legion
 * PDF" verb on a multi-file selection.
 *
 * Two pure-ish pieces, both unit-testable without Electron:
 *
 *   `launchIntentFromArgv` — Windows hands the paths over as ordinary argv
 *   entries (already split, so a path with spaces arrives as ONE entry).
 *   Anything that is not a file Legion PDF can open is junk to us: the
 *   executable itself, Chromium switches, the dev-mode app directory. The one
 *   switch that IS read is `--combine`, which the Explorer verb passes; it says
 *   the paths belong in the Combine Files panel rather than in tabs.
 *
 *   `OpenFilesRelay` — the first batch arrives before the renderer exists, so
 *   paths are queued until the window reports it has loaded and then flushed.
 *   Dropping them (the obvious bug) means a double-clicked PDF opens an empty
 *   app. Combine arrivals get one extra rule: Explorer launches ONE PROCESS PER
 *   SELECTED FILE, so ten selected exhibits arrive as ten separate `--combine`
 *   launches milliseconds apart. They are gathered for a quiet window and then
 *   delivered as ONE event, or the panel would flicker a list at the attorney
 *   one file at a time and combine whichever subset he clicked on.
 */

import { posix, win32 } from 'node:path';
import { isOpenablePath } from '@shared/convert-inputs';
import type { OpenFilesEvent } from '@shared/types';

/**
 * Which path grammar the argv is written in. Injected so the Windows shapes
 * this feature exists for (`C:\Matters\Ashford\dep.pdf`) can be tested on a
 * Linux runner; production always gets the platform's own.
 */
export type PathFlavor = Pick<typeof win32, 'isAbsolute' | 'resolve'>;

const NATIVE: PathFlavor = process.platform === 'win32' ? win32 : posix;

/** The switch Explorer's Combine verb passes ahead of the selected file. */
export const COMBINE_FLAG = '--combine';

/**
 * How long the relay waits for more `--combine` launches before handing the
 * batch over. Explorer's per-file processes land within a few hundred
 * milliseconds of each other; 1.5s of quiet is comfortably past the last one
 * without leaving the attorney watching a still screen.
 */
export const COMBINE_QUIET_WINDOW_MS = 1500;

/** What one launch (or one `second-instance` event) is asking for. */
export interface LaunchIntent {
  intent: 'open' | 'combine';
  /** Absolute paths, de-duplicated, in the order the command line listed them. */
  paths: string[];
}

/**
 * What the OS asked for on one command line. `workingDirectory` is what a
 * relative path is resolved against — Electron hands the second instance's own
 * cwd to the `second-instance` listener.
 */
export function launchIntentFromArgv(
  argv: readonly string[],
  workingDirectory: string,
  flavor: PathFlavor = NATIVE
): LaunchIntent {
  const paths: string[] = [];
  let combine = false;
  for (const argument of argv.slice(1)) {
    if (argument === COMBINE_FLAG) {
      combine = true;
      continue;
    }
    // A switch is never a file, even one that carries a .pdf value.
    if (argument.startsWith('-') || !isOpenablePath(argument)) continue;
    const absolute = flavor.isAbsolute(argument)
      ? argument
      : flavor.resolve(workingDirectory, argument);
    if (!paths.includes(absolute)) paths.push(absolute);
  }
  return { intent: combine && paths.length > 0 ? 'combine' : 'open', paths };
}

/** Numbers compare as numbers: Exhibit 2 belongs before Exhibit 10, not after. */
const NATURAL = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function fileNameOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/**
 * Explorer's launch ORDER is not the selection order — the per-file processes
 * race each other — so the batch is sorted by filename the way Explorer itself
 * lists a folder. The attorney sees the order he was looking at when he
 * right-clicked, and can still drag any row somewhere else.
 */
export function naturalFileOrder(paths: readonly string[]): string[] {
  return [...paths].sort(
    (left, right) =>
      NATURAL.compare(fileNameOf(left), fileNameOf(right)) || NATURAL.compare(left, right)
  );
}

type Deliver = (event: OpenFilesEvent) => void;

/** Holds OS file opens until the renderer is loaded, then hands them straight on. */
export class OpenFilesRelay {
  private queuedOpen: string[] = [];
  /** Combine paths still inside the quiet window. */
  private collecting: string[] = [];
  /** Combine paths whose window has closed, waiting only on a renderer. */
  private queuedCombine: string[] = [];
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private deliver: Deliver | null = null;

  /** Queue (or pass straight through) what the OS just handed us. */
  offer(launch: LaunchIntent): void {
    if (launch.paths.length === 0) return;
    if (launch.intent === 'combine') {
      this.collect(launch.paths);
      return;
    }
    this.queuedOpen.push(...launch.paths);
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

  /** Each new arrival restarts the wait, so the window closes after the LAST one. */
  private collect(paths: readonly string[]): void {
    for (const path of paths) {
      if (!this.collecting.includes(path)) this.collecting.push(path);
    }
    if (this.windowTimer !== null) clearTimeout(this.windowTimer);
    this.windowTimer = setTimeout(() => this.closeWindow(), COMBINE_QUIET_WINDOW_MS);
  }

  private closeWindow(): void {
    this.windowTimer = null;
    this.queuedCombine.push(...naturalFileOrder(this.collecting));
    this.collecting = [];
    this.flush();
  }

  private flush(): void {
    if (this.deliver === null) return;
    if (this.queuedOpen.length > 0) {
      const paths = this.queuedOpen;
      this.queuedOpen = [];
      this.deliver({ paths, intent: 'open' });
    }
    if (this.queuedCombine.length > 0) {
      const paths = this.queuedCombine;
      this.queuedCombine = [];
      this.deliver({ paths, intent: 'combine' });
    }
  }
}

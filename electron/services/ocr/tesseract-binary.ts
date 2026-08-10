/**
 * Where is Tesseract? Three answers, tried in this order:
 *
 *   1. `LIBRARIUS_TESSERACT_PATH` — an explicit override. If it is set and
 *      wrong we fail loudly; silently ignoring an override is how a machine
 *      ends up OCR'ing with a binary nobody chose.
 *   2. The bundle shipped beside the app (`resources/tesseract-win` on
 *      Windows, `resources/tesseract-linux` for WSL development). The dev tree
 *      and a packaged install put that directory in different places, so both
 *      layouts are checked.
 *   3. Plain `tesseract` on the PATH — the developer fallback.
 *
 * No filesystem access of its own: `exists` is injected, so resolution is a
 * pure function and fully unit-testable.
 */

import { join } from 'node:path';

export type TesseractSource = 'env' | 'bundled' | 'path';

export interface TesseractLocation {
  /** What to spawn: an absolute path, or bare `tesseract` from the PATH. */
  command: string;
  source: TesseractSource;
  /** Set as TESSDATA_PREFIX when the bundle carries its own language data. */
  tessdataPrefix: string | null;
}

export interface ResolveTesseractOptions {
  platform: NodeJS.Platform;
  /** Electron's `app.isPackaged` — dev and installed layouts differ. */
  isPackaged: boolean;
  /** `process.resourcesPath` of the installed app. */
  resourcesPath: string;
  /** Repo root in development (`app.getAppPath()`). */
  appRoot: string;
  /** Raw value of LIBRARIUS_TESSERACT_PATH, if the user set one. */
  envPath?: string | undefined;
  exists(candidate: string): boolean;
}

/** Thrown when an explicit override points at nothing. Never falls back. */
export class TesseractNotFoundError extends Error {
  readonly code = 'TESSERACT_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'TesseractNotFoundError';
  }
}

export const BUNDLE_DIRECTORY: Record<'win32' | 'other', string> = {
  win32: 'tesseract-win',
  other: 'tesseract-linux',
};

function bundleName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? BUNDLE_DIRECTORY.win32 : BUNDLE_DIRECTORY.other;
}

function binaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'tesseract.exe' : 'tesseract';
}

/** Packaged first when packaged, dev tree first otherwise — both are tried. */
function bundleRoots(options: ResolveTesseractOptions): string[] {
  const directory = bundleName(options.platform);
  const packaged = join(options.resourcesPath, directory);
  const development = join(options.appRoot, 'resources', directory);
  return options.isPackaged ? [packaged, development] : [development, packaged];
}

function tessdataIn(root: string, exists: (candidate: string) => boolean): string | null {
  const tessdata = join(root, 'tessdata');
  return exists(tessdata) ? tessdata : null;
}

function fromEnvironment(options: ResolveTesseractOptions): TesseractLocation | null {
  const envPath = options.envPath?.trim();
  if (envPath === undefined || envPath.length === 0) return null;
  if (!options.exists(envPath)) {
    throw new TesseractNotFoundError(
      `LIBRARIUS_TESSERACT_PATH points at ${envPath}, which does not exist.`
    );
  }
  return { command: envPath, source: 'env', tessdataPrefix: null };
}

function fromBundle(options: ResolveTesseractOptions): TesseractLocation | null {
  for (const root of bundleRoots(options)) {
    const command = join(root, binaryName(options.platform));
    if (options.exists(command)) {
      return { command, source: 'bundled', tessdataPrefix: tessdataIn(root, options.exists) };
    }
  }
  return null;
}

/** The binary this machine will run, and the language data that goes with it. */
export function resolveTesseract(options: ResolveTesseractOptions): TesseractLocation {
  return (
    fromEnvironment(options) ??
    fromBundle(options) ?? { command: 'tesseract', source: 'path', tessdataPrefix: null }
  );
}

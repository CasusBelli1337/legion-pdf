// #seam:centurion-error-code - the main-process half is electron/services/anthropic.ts
/**
 * Main throws plain-English errors tagged `[CODE] message`; Electron flattens
 * them to a message string with its own prefix on the way across IPC. This is
 * the one place that unwraps both, so every panel state is driven by a code and
 * shows a sentence written for an attorney.
 */

const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/;
const ERROR_PREFIX = /^Error:\s*/;
const CODE_PREFIX = /^\[([A-Z_]+)\]\s*/;

export interface CenturionFailure {
  /** Taxonomy code from main, or 'UNKNOWN' when the error came from elsewhere. */
  code: string;
  /** Plain English, ready to render. Never a stack trace. */
  message: string;
}

const FALLBACK =
  'Centurion hit an unexpected problem. Try again; if it repeats, restart Librarius.';

export function readFailure(error: unknown): CenturionFailure {
  const raw = (error instanceof Error ? error.message : String(error))
    .replace(IPC_PREFIX, '')
    .replace(ERROR_PREFIX, '')
    .trim();
  const match = CODE_PREFIX.exec(raw);
  if (match === null) return { code: 'UNKNOWN', message: raw === '' ? FALLBACK : raw };
  const message = raw.slice(match[0].length).trim();
  return { code: match[1] ?? 'UNKNOWN', message: message === '' ? FALLBACK : message };
}

/** True when the failure means "there is no key yet", so the panel shows key setup. */
export function isMissingKey(failure: CenturionFailure): boolean {
  return failure.code === 'NO_KEY';
}

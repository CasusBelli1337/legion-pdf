/**
 * What the panel shows when an ask fails. The taxonomy code arrives on the
 * terminal `ai:chunk` (`AiChunk.code`), typed by shared/; the thrown error
 * carries only the plain-English sentence, because Electron flattens an Error to
 * its message across IPC. This is the one place that strips Electron's wrapper
 * off that sentence and pairs it with the code.
 */

import type { CenturionErrorCode } from '@shared/types';
import { PRODUCT_NAME } from '@shared/product';

const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/;
const ERROR_PREFIX = /^Error:\s*/;

export interface CenturionFailure {
  /** Code from main, or 'UNKNOWN' when the failure never reached the service. */
  code: CenturionErrorCode;
  /** Plain English, ready to render. Never a stack trace. */
  message: string;
}

const FALLBACK = `Centurion hit an unexpected problem. Try again; if it repeats, restart ${PRODUCT_NAME}.`;

export function readFailure(error: unknown, code?: CenturionErrorCode | null): CenturionFailure {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(IPC_PREFIX, '')
    .replace(ERROR_PREFIX, '')
    .trim();
  return {
    code: code ?? 'UNKNOWN',
    message: message === '' ? FALLBACK : message,
  };
}

/** True when the failure means "there is no key yet", so the panel shows key setup. */
export function isMissingKey(failure: CenturionFailure): boolean {
  return failure.code === 'NO_KEY';
}

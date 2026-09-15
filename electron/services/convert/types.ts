/**
 * What every conversion engine looks like from the outside. One shape, so the
 * registry can order engines by preference and fall through to the next one
 * without knowing anything about Word, Chromium, or pdf-lib.
 */

export interface ConvertJob {
  /** Absolute path of the file on disk. */
  filePath: string;
  /** Just the name, for messages the attorney reads. */
  fileName: string;
  /** Lowercase extension WITH the dot; the registry has already vetted it. */
  extension: string;
}

export interface ConvertEngine {
  /** Stable id reported in ConvertSupport ('word', 'image', ...). */
  id: string;
  /** Plain-English name for the status list and error messages. */
  label: string;
  /** Lowercase extensions with the dot. */
  extensions: readonly string[];
  /** Why this engine is, or is not, usable on this computer. */
  note(available: boolean): string;
  /** Cached by the registry — a probe may spawn a process. */
  available(): Promise<boolean>;
  /** Produces PDF bytes. Throws in plain English; never returns empty. */
  run(job: ConvertJob): Promise<Uint8Array>;
}

/** Thrown when an engine's own tooling fails, already worded for the attorney. */
export class ConvertFailedError extends Error {
  readonly code = 'CONVERT_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'ConvertFailedError';
  }
}

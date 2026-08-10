/**
 * One page in, hOCR out. Spawns the real Tesseract BINARY — never tesseract.js
 * or a WASM build: the attorney's machine has 24 cores and the native binary is
 * the whole reason a 214-page scan finishes in a coffee break.
 *
 * hOCR rather than TSV because hOCR is the only output carrying a per-word
 * bounding box AND its confidence, which is exactly what the text layer needs.
 * It goes to stdout, so a run leaves one temp file (the PNG) instead of two.
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { OCR_CANCELLED } from '@shared/types';

export class OcrCancelledError extends Error {
  readonly code = OCR_CANCELLED;
  constructor(message = `${OCR_CANCELLED}: Text recognition was cancelled.`) {
    super(message);
    this.name = 'OcrCancelledError';
  }
}

export class TesseractFailedError extends Error {
  readonly code = 'TESSERACT_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'TesseractFailedError';
  }
}

/** The slice of a child process this module uses — keeps mocks honest and small. */
export interface SpawnedProcess {
  stdout: { on(event: 'data', listener: (chunk: Uint8Array) => void): unknown } | null;
  stderr: { on(event: 'data', listener: (chunk: Uint8Array) => void): unknown } | null;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { env: NodeJS.ProcessEnv }
) => SpawnedProcess;

export interface TesseractRunRequest {
  command: string;
  imagePath: string;
  language: string;
  dpi: number;
  tessdataPrefix: string | null;
  signal?: AbortSignal | undefined;
  /** Injectable for tests; defaults to node's child_process.spawn. */
  spawn?: SpawnFn | undefined;
}

/** `tesseract <image> stdout -l eng --dpi 300 hocr` — config file goes last. */
export function tesseractArguments(request: TesseractRunRequest): string[] {
  return [
    request.imagePath,
    'stdout',
    '-l',
    request.language,
    '--dpi',
    String(Math.round(request.dpi)),
    'hocr',
  ];
}

function environmentFor(tessdataPrefix: string | null): NodeJS.ProcessEnv {
  return tessdataPrefix === null
    ? { ...process.env }
    : { ...process.env, TESSDATA_PREFIX: tessdataPrefix };
}

interface Collector {
  out: string;
  err: string;
}

function collect(child: SpawnedProcess, collector: Collector): void {
  const decoder = new TextDecoder();
  child.stdout?.on('data', (chunk) => {
    collector.out += decoder.decode(chunk, { stream: true });
  });
  child.stderr?.on('data', (chunk) => {
    collector.err += decoder.decode(chunk, { stream: true });
  });
}

function describeExit(request: TesseractRunRequest, code: number | null, stderr: string): string {
  const detail = stderr.trim().split('\n').slice(-3).join(' ');
  return `Tesseract exited with code ${code} on ${request.imagePath}${detail ? `: ${detail}` : '.'}`;
}

/**
 * Run Tesseract over one PNG and resolve its hOCR. Rejects on a spawn failure,
 * a non-zero exit, or empty output — an unreadable page must never pass as a
 * page with no words on it.
 */
export function runTesseractHocr(request: TesseractRunRequest): Promise<string> {
  const spawn = request.spawn ?? (nodeSpawn as unknown as SpawnFn);
  return new Promise<string>((resolve, reject) => {
    if (request.signal?.aborted === true) {
      reject(new OcrCancelledError());
      return;
    }
    const collector: Collector = { out: '', err: '' };
    const child = spawn(request.command, tesseractArguments(request), {
      env: environmentFor(request.tessdataPrefix),
    });
    const onAbort = (): void => {
      child.kill('SIGTERM');
      reject(new OcrCancelledError());
    };
    request.signal?.addEventListener('abort', onAbort, { once: true });
    collect(child, collector);
    child.on('error', (error) => {
      request.signal?.removeEventListener('abort', onAbort);
      reject(
        new TesseractFailedError(
          `Could not start Tesseract at ${request.command}: ${error.message}`
        )
      );
    });
    child.on('close', (code) => {
      request.signal?.removeEventListener('abort', onAbort);
      if (code !== 0) {
        reject(new TesseractFailedError(describeExit(request, code, collector.err)));
        return;
      }
      if (collector.out.trim().length === 0) {
        reject(new TesseractFailedError(`Tesseract produced no hOCR for ${request.imagePath}.`));
        return;
      }
      resolve(collector.out);
    });
  });
}

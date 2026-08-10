/**
 * Spawn is mocked here so the argument list, the environment, the failure
 * paths, and cancellation are all asserted without a Tesseract install.
 * `tesseract-e2e.test.ts` covers the real binary.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  OcrCancelledError,
  TesseractFailedError,
  runTesseractHocr,
  tesseractArguments,
} from './tesseract-cli';
import type { SpawnFn, SpawnedProcess, TesseractRunRequest } from './tesseract-cli';

interface FakeProcess extends SpawnedProcess {
  emitStdout(text: string): void;
  emitStderr(text: string): void;
  close(code: number | null): void;
  fail(error: Error): void;
  killed: string[];
}

function fakeProcess(): FakeProcess {
  const listeners = { stdout: [], stderr: [], close: [], error: [] } as {
    stdout: ((chunk: Uint8Array) => void)[];
    stderr: ((chunk: Uint8Array) => void)[];
    close: ((code: number | null) => void)[];
    error: ((error: Error) => void)[];
  };
  const encoder = new TextEncoder();
  return {
    killed: [],
    stdout: { on: (_event, listener) => listeners.stdout.push(listener) },
    stderr: { on: (_event, listener) => listeners.stderr.push(listener) },
    on(event: 'error' | 'close', listener: never) {
      if (event === 'close') listeners.close.push(listener);
      else listeners.error.push(listener);
      return this;
    },
    kill(signal?: NodeJS.Signals) {
      this.killed.push(signal ?? 'SIGTERM');
      return true;
    },
    emitStdout(text) {
      for (const listener of listeners.stdout) listener(encoder.encode(text));
    },
    emitStderr(text) {
      for (const listener of listeners.stderr) listener(encoder.encode(text));
    },
    close(code) {
      for (const listener of listeners.close) listener(code);
    },
    fail(error) {
      for (const listener of listeners.error) listener(error);
    },
  };
}

function request(overrides: Partial<TesseractRunRequest> = {}): TesseractRunRequest {
  return {
    command: '/opt/tesseract/tesseract',
    imagePath: '/tmp/librarius-ocr-abc/page-37.png',
    language: 'eng',
    dpi: 300,
    tessdataPrefix: null,
    ...overrides,
  };
}

const HOCR = "<div class='ocr_page' title='bbox 0 0 10 10'></div>";

describe('tesseractArguments', () => {
  it('sends hOCR to stdout with the language and DPI, config file last', () => {
    expect(tesseractArguments(request())).toEqual([
      '/tmp/librarius-ocr-abc/page-37.png',
      'stdout',
      '-l',
      'eng',
      '--dpi',
      '300',
      'hocr',
    ]);
  });

  it('rounds a fractional DPI, which Tesseract will not accept', () => {
    expect(tesseractArguments(request({ dpi: 299.7 }))).toContain('300');
  });
});

describe('runTesseractHocr', () => {
  it('resolves the hOCR Tesseract printed', async () => {
    const child = fakeProcess();
    const spawn = vi.fn<SpawnFn>(() => child);
    const running = runTesseractHocr(request({ spawn }));
    child.emitStdout(HOCR);
    child.close(0);
    expect(await running).toBe(HOCR);
    expect(spawn).toHaveBeenCalledWith(
      '/opt/tesseract/tesseract',
      expect.arrayContaining(['hocr']),
      expect.objectContaining({ env: expect.any(Object) })
    );
  });

  it('points Tesseract at the bundled language data when there is some', async () => {
    const child = fakeProcess();
    const spawn = vi.fn<SpawnFn>(() => child);
    const running = runTesseractHocr(request({ spawn, tessdataPrefix: '/app/tessdata' }));
    child.emitStdout(HOCR);
    child.close(0);
    await running;
    const environment = spawn.mock.calls[0]?.[2].env ?? {};
    expect(environment.TESSDATA_PREFIX).toBe('/app/tessdata');
  });

  it('leaves TESSDATA_PREFIX alone when the binary knows its own data', async () => {
    const child = fakeProcess();
    const spawn = vi.fn<SpawnFn>(() => child);
    const running = runTesseractHocr(request({ spawn }));
    child.emitStdout(HOCR);
    child.close(0);
    await running;
    expect(spawn.mock.calls[0]?.[2].env).not.toHaveProperty('TESSDATA_PREFIX', expect.any(String));
  });

  it('reassembles hOCR that arrives in several chunks', async () => {
    const child = fakeProcess();
    const running = runTesseractHocr(request({ spawn: () => child }));
    child.emitStdout('<div ');
    child.emitStdout("class='ocr_page'>");
    child.emitStdout('</div>');
    child.close(0);
    expect(await running).toBe("<div class='ocr_page'></div>");
  });

  it('fails loudly on a non-zero exit, quoting what Tesseract said', async () => {
    const child = fakeProcess();
    const running = runTesseractHocr(request({ spawn: () => child }));
    child.emitStderr('Error in pixReadStream: Pdf reading is not supported\n');
    child.close(1);
    await expect(running).rejects.toThrow(/exited with code 1.*Pdf reading is not supported/s);
  });

  it('fails loudly when the binary cannot be started at all', async () => {
    const child = fakeProcess();
    const running = runTesseractHocr(request({ spawn: () => child }));
    child.fail(new Error('spawn ENOENT'));
    await expect(running).rejects.toBeInstanceOf(TesseractFailedError);
    await expect(running).rejects.toThrow(/Could not start Tesseract/);
  });

  it('treats empty output as a failure, never as a page with no words', async () => {
    const child = fakeProcess();
    const running = runTesseractHocr(request({ spawn: () => child }));
    child.emitStdout('   \n');
    child.close(0);
    await expect(running).rejects.toThrow(/produced no hOCR/);
  });

  it('kills the process and rejects when the run is cancelled mid-page', async () => {
    const controller = new AbortController();
    const child = fakeProcess();
    const running = runTesseractHocr(request({ spawn: () => child, signal: controller.signal }));
    controller.abort();
    await expect(running).rejects.toBeInstanceOf(OcrCancelledError);
    expect(child.killed).toEqual(['SIGTERM']);
  });

  it('does not spawn anything when the run was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const spawn = vi.fn<SpawnFn>(() => fakeProcess());
    await expect(runTesseractHocr(request({ spawn, signal: controller.signal }))).rejects.toThrow(
      /OCR_CANCELLED/
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});

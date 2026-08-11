import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import type { InvokeResponse } from '@shared/ipc';
import { redactedFileName } from './redact';

/**
 * The engine is unit-tested in core/redact; `ipcMain` does not exist in this
 * environment. What is checked here is the wiring the compiler cannot see: every
 * declared channel has a handler, the destruction path cannot skip its proof,
 * and the redacted document reaches the renderer as a store id.
 */
const HANDLERS = resolve(import.meta.dirname, './redact.ts');

function sourceOf(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('redact handler registration', () => {
  it('registers a handler for every redact:* channel the contract declares', () => {
    const source = sourceOf(HANDLERS);
    const names = invokeChannelsOf('redact').map(
      (channel) => Object.entries(IPC.redact).find(([, value]) => value === channel)?.[0]
    );

    expect(names).toEqual(['apply', 'verify']);
    for (const name of names) expect(source).toContain(`IPC.redact.${name}`);
    expect(source.match(/ipcMain\.handle\(/g)).toHaveLength(names.length);
  });
});

describe('the verification gate', () => {
  // The re-OCR branch writes NEW text onto the rebuilt pages, so it must repeat
  // the proof. If this assertion ever fails, a searchable redaction is being
  // handed over on the strength of a check made before the text layer existed.
  it('asserts the receipt again after re-OCR, before the document is adopted', () => {
    const source = sourceOf(HANDLERS);
    expect(source).toContain('assertVerified(result)');
    const verifyAgain = source.indexOf('const receipt = await verifyAgainAfterOcr(');
    const adopted = source.indexOf('await adopt(context, searchable');
    expect(verifyAgain).toBeGreaterThan(-1);
    expect(adopted).toBeGreaterThan(verifyAgain);
  });

  it('never adopts the source document — every output is a new store entry', () => {
    const source = sourceOf(HANDLERS);
    expect(source).not.toContain('store.setBytes');
    expect(source.match(/store\.adopt\(/g)).toHaveLength(1);
  });
});

describe('the redacted document', () => {
  // Drift guard, matching the one ops.test.ts keeps over merge/split/extract:
  // redaction builds a WHOLE NEW document and the renderer opens it by id. This
  // assertion stops compiling the moment the receipt loses that id, which is
  // what the old phase-string announcement seam guarded by matching a phrase in
  // two files.
  it('reports the adopted store id in the receipt', () => {
    expectTypeOf<InvokeResponse<'redact:apply'>['detail']['docId']>().toEqualTypeOf<
      string | undefined
    >();
  });

  // The compiler cannot prove the id came from the store rather than thin air.
  it('adopts the output into the store at the one creation site', () => {
    const source = sourceOf(HANDLERS);
    expect(source.match(/store\.adopt\(/g)).toHaveLength(1);
    expect(source).toContain('docId: session.id');
  });

  it('names the redacted document so the tab is unmistakable', () => {
    expect(redactedFileName('Deposition.pdf')).toBe('Deposition (redacted).pdf');
    expect(redactedFileName('exhibit.PDF')).toBe('exhibit (redacted).pdf');
    expect(redactedFileName('no-extension')).toBe('no-extension (redacted).pdf');
  });

  // The retired protocol announced the new document by pushing a phase string
  // down the progress channel, which two files had to agree on by hand. The id
  // now rides the receipt, so no phase constant may come back.
  it('announces the document through the receipt, never through a progress phase', () => {
    const source = sourceOf(HANDLERS);
    expect(source).not.toMatch(/phase:\s*[A-Za-z_]*DOCUMENT[A-Za-z_]*/);
    expect(source).not.toMatch(/emitProgress\([^)]*\bphase:\s*['"`]/);
  });
});

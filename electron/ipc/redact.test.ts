import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC, invokeChannelsOf } from '@shared/ipc';
import { REDACTED_DOCUMENT_PHASE, redactedFileName } from './redact';

/**
 * The engine is unit-tested in core/redact; `ipcMain` does not exist in this
 * environment. What is checked here is the wiring the compiler cannot see: every
 * declared channel has a handler, the destruction path cannot skip its proof,
 * and the two halves of the new-document seam still say the same thing.
 */
const HANDLERS = resolve(import.meta.dirname, './redact.ts');
const RENDERER = resolve(import.meta.dirname, '../../src/features/redact/redacted-document.ts');

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
    const verifyAgain = source.indexOf('verifyAgainAfterOcr(');
    const announce = source.indexOf('await announce(context, searchable');
    expect(verifyAgain).toBeGreaterThan(-1);
    expect(announce).toBeGreaterThan(verifyAgain);
  });

  it('never adopts the source document — every output is a new store entry', () => {
    const source = sourceOf(HANDLERS);
    expect(source).not.toContain('store.setBytes');
    expect(source.match(/store\.adopt\(/g)).toHaveLength(1);
  });
});

describe('#seam:redact-new-document', () => {
  it('names the redacted document so the tab is unmistakable', () => {
    expect(redactedFileName('Deposition.pdf')).toBe('Deposition (redacted).pdf');
    expect(redactedFileName('exhibit.PDF')).toBe('exhibit (redacted).pdf');
    expect(redactedFileName('no-extension')).toBe('no-extension (redacted).pdf');
  });

  it('agrees with the renderer half on the announcement phrase', () => {
    expect(sourceOf(RENDERER)).toContain(`'${REDACTED_DOCUMENT_PHASE}'`);
  });

  it('carries the marker on both halves so the pair stays greppable', () => {
    expect(sourceOf(HANDLERS)).toContain('#seam:redact-new-document');
    expect(sourceOf(RENDERER)).toContain('#seam:redact-new-document');
  });
});

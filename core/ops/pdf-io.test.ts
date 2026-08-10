import { describe, expect, it } from 'vitest';
import { EmptyDocumentError } from '../pdf-meta';
import { finish, loadPdf, sealResult } from './pdf-io';
import { labelledPages, makeTestPdf } from './test-fixtures';

describe('loadPdf', () => {
  it('refuses an empty file by name instead of opening nothing', async () => {
    await expect(loadPdf(new Uint8Array(), 'file "broken.pdf"')).rejects.toThrow(
      EmptyDocumentError
    );
    await expect(loadPdf(new Uint8Array(), 'file "broken.pdf"')).rejects.toThrow(
      'The file "broken.pdf" is empty (0 bytes) — nothing to work with.'
    );
  });

  it('refuses bytes that are not a PDF', async () => {
    await expect(loadPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

describe('sealResult', () => {
  it('verifies the page count of the SAVED bytes, not the caller’s promise', async () => {
    const bytes = await makeTestPdf({ pages: labelledPages(3) });

    await expect(sealResult(bytes, 3, 2, undefined, 'test result')).rejects.toThrow(
      'The test result came out with 3 pages but 2 were expected — the operation was abandoned rather than saved.'
    );
  });

  it('refuses to report success on empty output', async () => {
    await expect(sealResult(new Uint8Array(), 3, 3, undefined, 'test result')).rejects.toThrow(
      'The test result came back empty — refusing to report success.'
    );
  });

  it('returns the verified counts when everything lines up', async () => {
    const bytes = await makeTestPdf({ pages: labelledPages(4) });
    const result = await sealResult(bytes, 4, 4, { note: 'ok' });

    expect(result).toEqual({ bytes, pagesIn: 4, pagesOut: 4, detail: { note: 'ok' } });
  });
});

describe('finish', () => {
  it('saves, re-opens, and counts before handing anything back', async () => {
    const document = await loadPdf(await makeTestPdf({ pages: labelledPages(2) }));
    const result = await finish(document, 2, 2, undefined);

    expect(result.pagesIn).toBe(2);
    expect(result.pagesOut).toBe(2);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it('throws when the document ends up a different length than promised', async () => {
    const document = await loadPdf(await makeTestPdf({ pages: labelledPages(2) }));
    await expect(finish(document, 2, 5, undefined, 'test document')).rejects.toThrow(
      /came out with 2 pages but 5 were expected/
    );
  });
});

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeTestPdf } from '@core/ops/test-fixtures';
import { pageContentStreams, shownCharactersOn } from './page-content';

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

describe('pageContentStreams', () => {
  it('decodes the compressed content of a page', async () => {
    const document = await load(await makeTestPdf({ pages: [{ label: 'HELLO' }] }));
    const streams = pageContentStreams(document.getPage(0), 1);
    expect(streams).toHaveLength(1);
    expect(Buffer.from(streams[0] ?? new Uint8Array()).toString('latin1')).toContain('Tj');
  });

  it('returns nothing for a page that draws nothing', async () => {
    const document = await PDFDocument.create({ updateMetadata: false });
    document.addPage([100, 100]);
    expect(pageContentStreams(document.getPage(0), 1)).toEqual([]);
  });
});

describe('shownCharactersOn', () => {
  it('counts the characters a page actually shows', async () => {
    const document = await load(await makeTestPdf({ pages: [{ label: 'ABCDEF' }] }));
    expect(shownCharactersOn(document, 1)).toBe(6);
  });

  it('reports zero for a page with no content at all', async () => {
    const document = await PDFDocument.create({ updateMetadata: false });
    document.addPage([100, 100]);
    expect(shownCharactersOn(document, 1)).toBe(0);
  });

  // Silence is a claim about the WHOLE page, which is why it settles every
  // marked rectangle on it at once: a page drawing no text has nothing readable
  // inside a mark either.
  it('answers for one page without reading its neighbours', async () => {
    const document = await load(await makeTestPdf({ pages: [{ label: 'ALPHA' }, { label: '' }] }));
    expect(shownCharactersOn(document, 1)).toBe(5);
    expect(shownCharactersOn(document, 2)).toBe(0);
  });
});

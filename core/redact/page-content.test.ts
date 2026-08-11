import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeTestPdf } from '@core/ops/test-fixtures';
import { pageContentStreams, pageContentText, shownCharactersOn } from './page-content';

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
});

describe('pageContentText', () => {
  it('exposes the page operators as searchable lowercase text', async () => {
    const document = await load(await makeTestPdf({ pages: [{ label: 'SECRET' }] }));
    const text = pageContentText(document, 1);
    expect(text).toContain(Buffer.from('SECRET', 'latin1').toString('hex'));
  });

  it('reads only the page it was asked about', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'ALPHA' }, { label: 'BETA' }] });
    const document = await load(bytes);
    expect(pageContentText(document, 2)).not.toContain(
      Buffer.from('ALPHA', 'latin1').toString('hex')
    );
  });
});

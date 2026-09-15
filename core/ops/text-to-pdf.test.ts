/**
 * The built-in text converter is what runs on a computer without Word, so the
 * questions are the ones nobody would notice going wrong: does a long file
 * actually paginate, does a long line wrap instead of running off the page, and
 * does the text that comes out read back as the text that went in.
 *
 * Page counts are verified against the SAVED bytes (core/ops/pdf-io.ts does
 * that), so a writer that dropped a page would fail here rather than ship.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { textToPdf } from './text-to-pdf';

/** 792 - 144 of margin, over 11pt at 1.35 leading. */
const LINES_PER_PAGE = 43;

async function pages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

function lines(count: number, prefix = 'Line'): string {
  return Array.from({ length: count }, (_value, index) => `${prefix} ${index + 1}`).join('\n');
}

describe('textToPdf', () => {
  it('puts a short note on one Letter page', async () => {
    const result = await textToPdf('Served by mail on the parties listed below.');

    expect(result.pagesIn).toBe(1);
    expect(result.pagesOut).toBe(1);
    expect(result.detail.lines).toBe(1);
    const [page] = (await PDFDocument.load(result.bytes)).getPages();
    expect(page?.getSize()).toEqual({ width: 612, height: 792 });
  });

  it('fills exactly one page at the line limit and spills onto a second past it', async () => {
    const full = await textToPdf(lines(LINES_PER_PAGE));
    const over = await textToPdf(lines(LINES_PER_PAGE + 1));

    expect(await pages(full.bytes)).toBe(1);
    expect(full.pagesOut).toBe(1);
    expect(await pages(over.bytes)).toBe(2);
    expect(over.pagesOut).toBe(2);
  });

  it('paginates a long file and counts every line it drew', async () => {
    const result = await textToPdf(lines(500));

    expect(result.detail.lines).toBe(500);
    expect(result.pagesOut).toBe(Math.ceil(500 / LINES_PER_PAGE));
    expect(await pages(result.bytes)).toBe(result.pagesOut);
  });

  it('wraps a line too long for the column instead of running it off the page', async () => {
    const oneLine = await textToPdf('word '.repeat(60).trim());

    // 300 characters of Courier 11pt is far wider than the 468pt column.
    expect(oneLine.detail.lines).toBeGreaterThan(1);
    expect(await pages(oneLine.bytes)).toBe(1);
  });

  it('breaks a single unbroken word rather than overflowing', async () => {
    const result = await textToPdf('x'.repeat(400));

    expect(result.detail.lines).toBeGreaterThan(1);
  });

  it('starts a new page at a form feed', async () => {
    const result = await textToPdf('First page\n\f\nSecond page');

    expect(await pages(result.bytes)).toBe(2);
  });

  it('counts the characters the built-in fonts cannot print instead of failing', async () => {
    const result = await textToPdf('Settlement reached — see 中文 exhibit.');

    // The em dash is WinAnsi; the two Chinese characters are not.
    expect(result.detail.unprintable).toBe(2);
    expect(result.pagesOut).toBe(1);
  });

  it('honours the Times face and a larger size by fitting fewer lines per page', async () => {
    const big = await textToPdf(lines(60), { font: 'times', size: 24 });

    expect(await pages(big.bytes)).toBeGreaterThan(1);
  });

  it('still produces a readable one-page PDF for an empty file', async () => {
    const result = await textToPdf('');

    expect(result.pagesOut).toBe(1);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });
});

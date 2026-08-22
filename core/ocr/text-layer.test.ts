/**
 * The writer is verified by READING the result back with pdfjs — the same
 * engine the app's viewer uses — so "searchable" means searchable in the
 * product, not merely "operators were emitted".
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { sanitizeToFont, writeTextLayer } from './text-layer';
import { EmptyOcrPageError } from './types';
import type { OcrPageWords, OcrWord } from './types';
import { extractTextItems } from './pdfjs-extract.testkit';

const RASTER = { widthPx: 2550, heightPx: 3300 };

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, box: { x0, y0, x1, y1 }, confidence: 95 };
}

async function blankPdf(rotation = 0, size: [number, number] = [612, 792]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage(size);
  page.setRotation(degrees(rotation));
  return document.save();
}

function page(words: OcrWord[], overrides: Partial<OcrPageWords> = {}): OcrPageWords {
  return { page: 1, ...RASTER, words, blank: false, ...overrides };
}

describe('writeTextLayer', () => {
  it('makes a scanned page searchable, at the position Tesseract found the word', async () => {
    // "SUPERIOR" as real Tesseract reported it on a 300 DPI letter-size raster.
    const result = await writeTextLayer(await blankPdf(), [
      page([word('SUPERIOR', 306, 328, 702, 384)]),
    ]);

    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(result.pagesIn).toBe(1);
    expect(result.pagesOut).toBe(1);
    expect(result.detail).toEqual({ pagesOcred: [1], charsPerPage: [8], wordsPerPage: [1] });

    const items = await extractTextItems(result.bytes, 1);
    expect(items.map((item) => item.str)).toEqual(['SUPERIOR']);
    // 306px * 0.24 = 73.44pt from the left; 792 - 384*0.24 = 699.84pt from the bottom.
    expect(items[0]?.x).toBeCloseTo(73.44, 2);
    expect(items[0]?.y).toBeCloseTo(699.84, 2);
    // The word is stretched to the width of its box: (702-306) * 0.24 = 95.04pt.
    expect(items[0]?.width).toBeCloseTo(95.04, 1);
  });

  it('writes every word of a multi-word page and counts the characters', async () => {
    const words = [
      word('EXHIBIT', 302, 504, 495, 551),
      word('A', 514, 506, 561, 550),
      word('ASHFORD000123', 304, 677, 706, 717),
    ];
    const result = await writeTextLayer(await blankPdf(), [page(words)]);

    expect(result.detail.charsPerPage).toEqual([21]);
    expect(result.detail.wordsPerPage).toEqual([3]);
    const items = await extractTextItems(result.bytes, 1);
    expect(items.map((item) => item.str)).toEqual(['EXHIBIT', 'A', 'ASHFORD000123']);
  });

  it('lands words correctly on a page whose /Rotate turns it a quarter turn', async () => {
    // A landscape raster of a quarter-turned letter page: 3300 x 2550 px.
    const rotated = page([word('ROTATED', 100, 200, 500, 260)], {
      widthPx: 3300,
      heightPx: 2550,
    });
    const result = await writeTextLayer(await blankPdf(90), [rotated]);

    const items = await extractTextItems(result.bytes, 1);
    expect(items.map((item) => item.str)).toEqual(['ROTATED']);
    // Near the displayed TOP-left, which on a page turned 90 degrees clockwise
    // is the BOTTOM-left of user space: display (24, 549.6) -> user (62.4, 24).
    expect(items[0]?.x).toBeCloseTo(62.4, 1);
    expect(items[0]?.y).toBeCloseTo(24, 1);
  });

  it('honours a crop box that does not start at the origin', async () => {
    const document = await PDFDocument.create();
    const created = document.addPage([612, 792]);
    created.setCropBox(20, 30, 572, 732);
    const bytes = await document.save();

    const result = await writeTextLayer(bytes, [
      page([word('OFFSET', 0, 0, 200, 50)], { widthPx: 2383, heightPx: 3050 }),
    ]);
    const items = await extractTextItems(result.bytes, 1);
    expect(items[0]?.x).toBeCloseTo(20, 1);
    expect(items[0]?.y).toBeCloseTo(30 + 732 - 50 * (732 / 3050), 1);
  });

  it('accepts a page with no words when its raster was proven blank', async () => {
    const result = await writeTextLayer(await blankPdf(), [page([], { blank: true })]);
    expect(result.detail).toEqual({ pagesOcred: [1], charsPerPage: [0], wordsPerPage: [0] });
    expect(await extractTextItems(result.bytes, 1)).toEqual([]);
  });

  it('REFUSES a page with no words that was not blank', async () => {
    await expect(writeTextLayer(await blankPdf(), [page([])])).rejects.toBeInstanceOf(
      EmptyOcrPageError
    );
  });

  it('refuses a page number outside the document', async () => {
    await expect(
      writeTextLayer(await blankPdf(), [page([word('X', 1, 1, 20, 20)], { page: 7 })])
    ).rejects.toThrow(/outside this 1-page document/);
  });

  it('refuses the same page twice', async () => {
    const one = page([word('X', 1, 1, 20, 20)]);
    await expect(writeTextLayer(await blankPdf(), [one, { ...one }])).rejects.toThrow(
      /recognized twice/
    );
  });

  it('refuses a raster whose shape does not match the page', async () => {
    // A landscape raster handed in for a portrait page: every word would land
    // somewhere wrong, and nothing about the hOCR itself would look broken.
    await expect(
      writeTextLayer(await blankPdf(), [
        page([word('WRONG', 10, 10, 200, 60)], { widthPx: 3300, heightPx: 2550 }),
      ])
    ).rejects.toThrow(/refusing to place words from the wrong raster/);
  });

  it('refuses a run over zero pages rather than reporting success', async () => {
    await expect(writeTextLayer(await blankPdf(), [])).rejects.toThrow(/zero pages/);
  });

  it('refuses to write into an empty byte array', async () => {
    await expect(writeTextLayer(new Uint8Array(), [page([])])).rejects.toThrow(/0 bytes/);
  });

  it('leaves the existing page content in place', async () => {
    const source = await blankPdf();
    const result = await writeTextLayer(source, [page([word('ADDED', 100, 100, 400, 160)])]);
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});

describe('sanitizeToFont', () => {
  const charset = new Set([0x41, 0x42, 0x3f]);

  it('keeps characters the font can encode', () => {
    expect(sanitizeToFont('AB', charset)).toBe('AB');
  });

  it('substitutes rather than drops what the font cannot encode', () => {
    expect(sanitizeToFont('A中B', charset)).toBe('A?B');
    expect(sanitizeToFont('A中B', charset)).toHaveLength(3);
  });
});

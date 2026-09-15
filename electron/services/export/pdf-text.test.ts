/**
 * Text extraction runs pdfjs in the MAIN process, which is unusual enough to
 * be worth proving here rather than only in the live app: a fixture with known
 * words in a known order goes in, and the same words come back page by page.
 */

import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { openPdfText } from './pdf-text';

const LINES: Record<number, string[]> = {
  1: ['ASHFORD v. ASHFORD', 'DEPOSITION OF JAMES ASHFORD', 'Volume I'],
  2: ['Q. Did you review the trust instrument?', 'A. Only the signature page.'],
  3: ['CERTIFICATE OF REPORTER'],
};

async function fixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.TimesRoman);
  for (const page of [1, 2, 3]) {
    const sheet = document.addPage([612, 792]);
    (LINES[page] ?? []).forEach((line, index) => {
      sheet.drawText(line, { x: 72, y: 700 - index * 24, size: 12, font });
    });
  }
  return document.save();
}

/** A page with nothing on it at all — the scan case, without a scan. */
async function blankFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return document.save();
}

describe('openPdfText', () => {
  it('reads each page back with its own words and nothing from its neighbours', async () => {
    const source = await openPdfText(await fixture());
    try {
      const first = await source.pageText(1);
      expect(first).toContain('ASHFORD v. ASHFORD');
      expect(first).toContain('Volume I');
      expect(first).not.toContain('CERTIFICATE');

      expect(await source.pageText(2)).toContain('Did you review the trust instrument?');
      expect(await source.pageText(3)).toContain('CERTIFICATE OF REPORTER');
    } finally {
      await source.close();
    }
  });

  it('keeps the line breaks the page was laid out with', async () => {
    const source = await openPdfText(await fixture());
    try {
      const lines = (await source.pageText(1))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      expect(lines).toEqual(LINES[1]);
    } finally {
      await source.close();
    }
  });

  it('answers empty for a page that carries no text, rather than inventing any', async () => {
    const source = await openPdfText(await blankFixture());
    try {
      expect((await source.pageText(1)).trim()).toBe('');
    } finally {
      await source.close();
    }
  });

  it('refuses a page number the document does not have', async () => {
    const source = await openPdfText(await fixture());
    try {
      await expect(source.pageText(4)).rejects.toThrow(/it has 3 pages/);
      await expect(source.pageText(0)).rejects.toThrow(/not in this document/);
    } finally {
      await source.close();
    }
  });
});

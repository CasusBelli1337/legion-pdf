import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeTestPdf } from '@core/ops/test-fixtures';
import { encodeRgbPng } from './png-encode';
import { countOccurrences, encodingsOf, residueOf, scannableText } from './residue-scan';

const SECRET = 'SSN 545-45-6789';

/** A raster whose PIXEL BYTES spell the secret in ASCII — the false-positive trap. */
function pngSpelling(text: string): Uint8Array {
  const ascii = Buffer.from(text.repeat(20), 'latin1');
  const widthPx = 8;
  const heightPx = Math.ceil(ascii.length / (widthPx * 3));
  const rgb = new Uint8Array(widthPx * heightPx * 3);
  rgb.set(ascii.subarray(0, rgb.length));
  return encodeRgbPng({ widthPx, heightPx, rgb });
}

describe('encodingsOf', () => {
  it('covers the literal, the WinAnsi hex, and the UTF-16BE hex forms', () => {
    const [literal, latin1, utf16] = encodingsOf('AB');
    expect(literal).toBe('ab');
    expect(latin1).toBe('4142');
    expect(utf16).toBe('00410042');
  });

  it('omits the byte-order mark so a needle inside a longer string still matches', () => {
    expect(encodingsOf('AB')[2]).not.toContain('feff');
  });
});

describe('residueOf', () => {
  it('finds text pdf-lib compressed into a content stream', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: SECRET }] });
    expect(residueOf(bytes, [SECRET])).toEqual([SECRET]);
  });

  it('finds text hidden in a bookmark title, written as UTF-16BE hex', async () => {
    const bytes = await makeTestPdf({
      pages: [{ label: 'PUBLIC' }],
      bookmarks: [{ title: `Account ${SECRET}`, page: 1, children: [] }],
    });
    expect(residueOf(bytes, [SECRET])).toEqual([SECRET]);
  });

  it('finds text in the document information dictionary', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'PUBLIC' }], info: { Author: SECRET } });
    expect(residueOf(bytes, [SECRET])).toEqual([SECRET]);
  });

  it('reports nothing for a document that never contained it', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'PUBLIC' }] });
    expect(residueOf(bytes, [SECRET])).toEqual([]);
  });

  it('reports every survivor, not just the first', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: SECRET }, { label: 'ACCT-99887766' }] });
    expect(residueOf(bytes, [SECRET, 'ACCT-99887766', 'ABSENT'])).toEqual([
      SECRET,
      'ACCT-99887766',
    ]);
  });

  it('does NOT read image samples as text', async () => {
    // Image streams are pixels by construction. Inflating them and grepping the
    // result turns coincidence into a failed redaction, so they are excluded —
    // this raster literally spells the secret in its pixel bytes.
    const document = await PDFDocument.create({ updateMetadata: false });
    const image = await document.embedPng(pngSpelling(SECRET));
    const page = document.addPage([200, 200]);
    page.drawImage(image, { x: 0, y: 0, width: 200, height: 200 });
    const bytes = await document.save();
    expect(residueOf(bytes, [SECRET])).toEqual([]);
  });

  it('has nothing to say when asked about no strings', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: SECRET }] });
    expect(residueOf(bytes, [])).toEqual([]);
  });
});

describe('countOccurrences', () => {
  it('counts a marker once per page it appears on', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: SECRET }, { label: SECRET }] });
    expect(countOccurrences(bytes, SECRET)).toBeGreaterThanOrEqual(2);
  });

  it('returns zero for a string the document never held', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'PUBLIC' }] });
    expect(countOccurrences(bytes, SECRET)).toBe(0);
  });

  it('returns zero for an empty needle rather than counting every gap', async () => {
    const bytes = await makeTestPdf({ pages: [{ label: 'PUBLIC' }] });
    expect(countOccurrences(bytes, '')).toBe(0);
  });
});

describe('scannableText', () => {
  it('includes inflated stream contents, not just the raw file', async () => {
    // pdf-lib compresses the content stream AND writes the text as hex, so the
    // marker is invisible to a raw grep and plain to an inflating one.
    const bytes = await makeTestPdf({ pages: [{ label: SECRET }] });
    const hex = Buffer.from(SECRET, 'latin1').toString('hex');
    expect(Buffer.from(bytes).toString('latin1').toLowerCase().includes(hex)).toBe(false);
    expect(scannableText(bytes).includes(hex)).toBe(true);
  });
});

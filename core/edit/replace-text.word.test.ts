import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { TextEditBlock } from '@shared/types';
import { extractTextItems } from '@core/ocr/pdfjs-extract.testkit';
import { inspectTextAt } from './inspect-text';
import { replaceText } from './replace-text';

/**
 * A PDF Microsoft Word itself wrote (qa/make-word-letter.mjs → real Word via
 * the docx-render skill): subset TrueType faces with WinAnsi encodings and no
 * ToUnicode, plus a CID face for the typographic characters — the shapes an
 * attorney's own filings have. Fictional parties.
 */
const WORD_LETTER = fileURLToPath(new URL('../../qa/fixtures/word-letter.pdf', import.meta.url));

async function open(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(WORD_LETTER));
}

async function textOf(bytes: Uint8Array): Promise<string> {
  return (await extractTextItems(bytes, 1))
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ');
}

/** The body paragraph — "closing date" sits on its first line. */
async function paragraph(bytes: Uint8Array): Promise<TextEditBlock> {
  const items = await extractTextItems(bytes, 1);
  const anchor = items.find((item) => item.str.includes('closing date'));
  if (anchor === undefined) throw new Error('fixture changed');
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const block = await inspectTextAt(document, {
    page: 1,
    at: { x: anchor.x + 5, y: anchor.y + 4 },
  });
  if (block === null) throw new Error('no paragraph under the anchor');
  return block;
}

describe('editing a PDF that Word wrote', () => {
  it('reads the paragraph as Word set it: Times New Roman, 12 pt, double spaced, justified', async () => {
    const block = await paragraph(await open());
    expect(block.text).toContain('The parties, Ashford Holdings LLC');
    expect(block.text).toContain('time being of the essence.');
    expect(block.text).not.toContain('SETTLEMENT TERM SHEET');
    expect(block.text).not.toContain('attorneys');
    expect(block.lines).toHaveLength(3);
    expect(block.font.documentFont).toBe('TimesNewRomanPSMT');
    expect(block.font.sizePt).toBe(12);
    expect(block.font.reusable).toBe(true);
    expect(block.leadingPt).toBeCloseTo(27.6, 0);
    expect(block.alignment).toBe('justify');
  });

  it("rewrites the paragraph in Word's own embedded Times, reflowed on the same measure", async () => {
    const bytes = await open();
    const block = await paragraph(bytes);
    const result = await replaceText(bytes, {
      page: 1,
      block,
      text: 'The parties agree that the closing date is April 3, 2026, and that the settlement amount shall be paid by wire within ten days of closing.',
    });
    expect(result.detail.fontMode).toBe('document-font');
    expect(result.detail.missingCharacters).toEqual([]);
    expect(result.detail.linesAfter).toBe(2);
    const after = await textOf(result.bytes);
    expect(after).toContain('April 3, 2026');
    expect(after).not.toContain('Meridian');
    expect(after).toContain('attorneys’ fees');
    // The heading and the second paragraph did not move.
    const before = await extractTextItems(bytes, 1);
    const afterItems = await extractTextItems(result.bytes, 1);
    for (const needle of ['SETTLEMENT', 'attorneys']) {
      const was = before.find((item) => item.str.includes(needle));
      const is = afterItems.find((item) => item.str.includes(needle));
      expect(is?.y).toBeCloseTo(was?.y ?? Number.NaN, 3);
    }
  });

  it('names the glyph the subset lacks and sets the paragraph in built-in Times instead', async () => {
    const bytes = await open();
    const block = await paragraph(bytes);
    const dry = await replaceText(bytes, { page: 1, block, text: 'Zeta closing.', dryRun: true });
    expect(dry.detail.fontMode).toBe('built-in-font');
    expect(dry.detail.missingCharacters).toEqual(['Z']);
    expect(dry.detail.builtInFont).toEqual({ family: 'times' });
    const result = await replaceText(bytes, { page: 1, block, text: 'Zeta closing.' });
    expect(await textOf(result.bytes)).toContain('Zeta closing.');
  });
});

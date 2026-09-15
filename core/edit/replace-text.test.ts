import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { TextEditBlock } from '@shared/types';
import { extractTextItems } from '@core/ocr/pdfjs-extract.testkit';
import { makeFormTextPdf, makeTextPdf, makeTrueTypePdf, type TextPageSpec } from './edit-testkit';
import { NoEditableTextError, inspectTextAt } from './inspect-text';
import { replaceText } from './replace-text';

const LIBERATION_SANS = fileURLToPath(
  new URL('../../src/public/pdfjs/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)
);

/** Two paragraphs of Helvetica prose, 14pt leading, plus a pleading line number. */
const PROSE: TextPageSpec = {
  width: 400,
  height: 400,
  lines: [
    { text: 'The parties agree that the closing date is', x: 60, y: 300 },
    { text: 'March 3, 2026 unless extended in', x: 60, y: 286 },
    { text: 'by both sides.', x: 60, y: 272 },
    { text: 'UNRELATED PARAGRAPH BELOW', x: 60, y: 230 },
    { text: '1', x: 24, y: 300 },
  ],
};

async function textOf(bytes: Uint8Array): Promise<string> {
  return (await extractTextItems(bytes, 1)).map((item) => item.str).join(' ');
}

async function inspect(bytes: Uint8Array, x: number, y: number): Promise<TextEditBlock | null> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return inspectTextAt(document, { page: 1, at: { x, y } });
}

async function openProse(): Promise<{ bytes: Uint8Array; block: TextEditBlock }> {
  const bytes = await makeTextPdf(PROSE);
  const block = await inspect(bytes, 100, 290);
  if (block === null) throw new Error('The fixture paragraph was not found.');
  return { bytes, block };
}

describe('inspectTextAt', () => {
  it('reports the whole paragraph under a click, and how it is set', async () => {
    const { block } = await openProse();
    expect(block.text).toBe(
      'The parties agree that the closing date is\nMarch 3, 2026 unless extended in\nby both sides.'
    );
    expect(block.lines).toHaveLength(3);
    expect(block.font.documentFont).toBe('Helvetica');
    expect(block.font.sizePt).toBe(12);
    expect(block.font.reusable).toBe(true);
    expect(block.leadingPt).toBeCloseTo(14, 6);
    expect(block.alignment).toBe('left');
    expect(block.angle).toBe(0);
    expect(block.lines[0]?.origin).toEqual({ x: 60, y: 300 });
  });

  it('answers null off the text, and keeps the line number out of the paragraph', async () => {
    const bytes = await makeTextPdf(PROSE);
    expect(await inspect(bytes, 200, 100)).toBeNull();
    const number = await inspect(bytes, 26, 302);
    expect(number?.text).toBe('1');
  });

  it('refuses invisible OCR text and text inside a form, in plain English', async () => {
    const scanned = await makeTextPdf({
      lines: [{ text: 'HIDDEN LAYER', x: 50, y: 200, renderMode: 3 }],
    });
    await expect(inspect(scanned, 60, 203)).rejects.toThrow(NoEditableTextError);
    await expect(inspect(scanned, 60, 203)).rejects.toThrow(/scanned picture/);
    const form = await makeFormTextPdf({ text: 'FORM TEXT', x: 0, y: 0 }, { x: 50, y: 195 });
    await expect(inspect(form, 60, 198)).rejects.toThrow(/reusable graphic/);
  });
});

describe('replaceText', () => {
  it('rewrites the paragraph in the document font and proves it on the saved bytes', async () => {
    const { bytes, block } = await openProse();
    const before = await extractTextItems(bytes, 1);
    const result = await replaceText(bytes, {
      page: 1,
      block,
      text: 'The parties agree that the closing date is April 9, 2026 and may not be extended.',
    });
    expect(result.detail.fontMode).toBe('document-font');
    expect(result.detail.missingCharacters).toEqual([]);
    expect(result.detail.linesBefore).toBe(3);
    expect(result.detail.glyphsRemoved).toBe(
      'The parties agree that the closing date isMarch 3, 2026 unless extended inby both sides.'
        .length
    );
    const after = await textOf(result.bytes);
    expect(after).toContain('April 9, 2026');
    expect(after).not.toContain('March 3');
    expect(after).toContain('UNRELATED PARAGRAPH BELOW');
    // The paragraph below did not move.
    const unrelatedBefore = before.find((item) => item.str.includes('UNRELATED'));
    const unrelatedAfter = (await extractTextItems(result.bytes, 1)).find((item) =>
      item.str.includes('UNRELATED')
    );
    expect(unrelatedAfter?.x).toBeCloseTo(unrelatedBefore?.x ?? Number.NaN, 6);
    expect(unrelatedAfter?.y).toBeCloseTo(unrelatedBefore?.y ?? Number.NaN, 6);
    // The new first line starts where the old one did.
    const first = (await extractTextItems(result.bytes, 1)).find((item) =>
      item.str.startsWith('The parties')
    );
    expect(first?.x).toBeCloseTo(60, 3);
    expect(first?.y).toBeCloseTo(300, 3);
  });

  it('wraps the new text on the old measure and steps lines by the old leading', async () => {
    const { bytes, block } = await openProse();
    const result = await replaceText(bytes, {
      page: 1,
      block,
      text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.',
    });
    const items = (await extractTextItems(result.bytes, 1)).filter((item) => item.y > 250);
    const baselines = [...new Set(items.map((item) => Math.round(item.y * 100) / 100))].sort(
      (a, b) => b - a
    );
    expect(baselines[0]).toBeCloseTo(300, 3);
    expect(baselines[1]).toBeCloseTo(286, 3);
    expect(result.detail.linesAfter).toBe(baselines.length);
    expect(result.detail.overflowed).toBe(result.detail.linesAfter > 3);
    const rightEdge = Math.max(...items.map((item) => item.x + item.width));
    expect(rightEdge).toBeLessThanOrEqual(block.rect.x + block.rect.width + 0.5);
  });

  it('reads back exactly the edited text through the same reader afterwards', async () => {
    const { bytes, block } = await openProse();
    const result = await replaceText(bytes, { page: 1, block, text: 'Short now.' });
    const again = await inspect(result.bytes, 62, 302);
    expect(again?.text).toBe('Short now.');
    expect(result.detail.linesAfter).toBe(1);
  });

  it('deletes the paragraph when the new text is empty', async () => {
    const { bytes, block } = await openProse();
    const result = await replaceText(bytes, { page: 1, block, text: '' });
    const after = await textOf(result.bytes);
    expect(after).not.toContain('parties');
    expect(after).toContain('UNRELATED PARAGRAPH BELOW');
    expect(result.detail.glyphsAdded).toBe(0);
  });

  it('plans without changing anything on a dry run', async () => {
    const { bytes, block } = await openProse();
    const result = await replaceText(bytes, { page: 1, block, text: 'Dry.', dryRun: true });
    expect(result.bytes).toBe(bytes);
    expect(result.detail.linesAfter).toBe(1);
    expect(result.detail.fontMode).toBe('document-font');
  });

  it('refuses when the paragraph no longer reads as it did', async () => {
    const { bytes, block } = await openProse();
    const stale = { ...block, text: 'Something else entirely' };
    await expect(replaceText(bytes, { page: 1, block: stale, text: 'x' })).rejects.toThrow(
      /has changed/
    );
  });

  it('refuses a character no font can show, by name', async () => {
    const { bytes, block } = await openProse();
    await expect(replaceText(bytes, { page: 1, block, text: 'Cyrillic Ж here' })).rejects.toThrow(
      /"Ж"/
    );
  });

  it('keeps justified prose justified', async () => {
    const bytes = await makeTextPdf({
      lines: [
        { text: 'HHHH HHHH HHHH HHHH', x: 60, y: 300 },
        { text: 'HHHH HHHH HHHH HHHH', x: 60, y: 286 },
        { text: 'HH HH', x: 60, y: 272 },
      ],
    });
    const block = await inspect(bytes, 80, 290);
    expect(block?.alignment).toBe('justify');
    if (block === null) throw new Error('no block');
    const result = await replaceText(bytes, {
      page: 1,
      block,
      text: 'HHHH HHHH HHHH HHHH HHH HHHH HHHH HHHH HH',
    });
    const items = (await extractTextItems(result.bytes, 1)).filter((item) => item.y > 295);
    const right = Math.max(...items.map((item) => item.x + item.width));
    expect(right).toBeCloseTo(block.rect.x + block.rect.width, 0);
  });

  it('follows text that runs up the page', async () => {
    const bytes = await makeTextPdf({
      lines: [
        { text: 'SIDEWAYS FIRST', x: 100, y: 100, angle: 90 },
        { text: 'SIDEWAYS SECOND', x: 114, y: 100, angle: 90 },
      ],
    });
    const block = await inspect(bytes, 102, 120);
    expect(block?.text).toBe('SIDEWAYS FIRST\nSIDEWAYS SECOND');
    expect(block?.angle).toBeCloseTo(90, 6);
    if (block === null) throw new Error('no block');
    const result = await replaceText(bytes, { page: 1, block, text: 'TURNED AND EDITED' });
    expect(await textOf(result.bytes)).toContain('TURNED AND EDITED');
    const again = await inspect(result.bytes, 102, 120);
    expect(again?.angle).toBeCloseTo(90, 6);
  });
});

describe('replaceText with an embedded subset font (a Word-made PDF)', () => {
  const spec: TextPageSpec = {
    lines: [
      { text: 'Hello World, this is the first line of', x: 60, y: 300 },
      { text: 'a short paragraph set in Liberation.', x: 60, y: 286 },
    ],
  };

  it('stays in the document font when the subset has every glyph', async () => {
    const program = new Uint8Array(await readFile(LIBERATION_SANS));
    const bytes = await makeTrueTypePdf(spec, program);
    const block = await inspect(bytes, 80, 302);
    expect(block?.font.documentFont).toMatch(/^LiberationSans/);
    expect(block?.font.reusable).toBe(true);
    if (block === null) throw new Error('no block');
    const result = await replaceText(bytes, {
      page: 1,
      block,
      text: 'Hello World, this is the first line the parties set.',
    });
    expect(result.detail.fontMode).toBe('document-font');
    const after = await textOf(result.bytes);
    expect(after).toContain('the parties set');
    expect(after).not.toContain('Liberation');
  });

  it('falls back to the closest built-in face when a glyph is missing, and says which', async () => {
    const program = new Uint8Array(await readFile(LIBERATION_SANS));
    const bytes = await makeTrueTypePdf(spec, program);
    const block = await inspect(bytes, 80, 302);
    if (block === null) throw new Error('no block');
    const dry = await replaceText(bytes, { page: 1, block, text: 'Hello Zed', dryRun: true });
    expect(dry.detail.fontMode).toBe('built-in-font');
    expect(dry.detail.missingCharacters).toEqual(['Z']);
    expect(dry.detail.builtInFont).toEqual({ family: 'helvetica' });
    const result = await replaceText(bytes, { page: 1, block, text: 'Hello Zed' });
    expect(await textOf(result.bytes)).toContain('Hello Zed');
  });
});

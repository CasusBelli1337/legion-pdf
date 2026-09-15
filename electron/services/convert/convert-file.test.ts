/**
 * The gate every conversion passes through on its way to the attorney.
 *
 * The engines are stubbed here on purpose: what is being tested is the
 * PROMISE this file makes — that a result which is empty, unreadable, or
 * page-less is reported as a failure and never adopted as a document. That is
 * exactly the class of bug that looks like success, so it gets its own suite
 * with engines that fail on command.
 */

import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ConvertEngine } from './types';

const registry = vi.hoisted(() => ({ engine: null as ConvertEngine | null }));

vi.mock('./registry', () => ({
  engineForPath: () => {
    if (registry.engine === null) throw new Error('no engine set for this test');
    return Promise.resolve(registry.engine);
  },
}));

const { convertToPdf, convertedName } = await import('./convert-file');
const { reportConvertProgress, setConvertProgressSink } = await import('./progress');

function engineProducing(bytes: Uint8Array, label = 'Microsoft Word'): ConvertEngine {
  registry.engine = {
    id: 'stub',
    label,
    extensions: ['.docx'],
    note: () => 'stub',
    available: () => Promise.resolve(true),
    run: () => Promise.resolve(bytes),
  };
  return registry.engine;
}

async function realPdf(pages: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([612, 792]);
  return document.save();
}

describe('convertedName', () => {
  it('swaps the extension for .pdf so the original is never written over', () => {
    expect(convertedName('/matters/ashford/letter.docx')).toBe('letter.pdf');
    expect(convertedName('C:\\matters\\exhibit 4.TIFF')).toBe('exhibit 4.pdf');
  });

  it('adds .pdf to a name that has no extension', () => {
    expect(convertedName('/matters/notes')).toBe('notes.pdf');
  });
});

describe('convertToPdf', () => {
  it('hands back verified bytes, the new name, and the page count', async () => {
    engineProducing(await realPdf(3));

    const result = await convertToPdf('/matters/letter.docx');

    expect(result.fileName).toBe('letter.pdf');
    expect(result.pageCount).toBe(3);
    expect(result.engineId).toBe('stub');
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it('names the file it is working on while it works', async () => {
    engineProducing(await realPdf(1));
    const seen: string[] = [];
    setConvertProgressSink((phase, current, total) => seen.push(`${phase} ${current}/${total}`));

    await convertToPdf('/matters/letter.docx');
    setConvertProgressSink(() => undefined);

    expect(seen).toEqual(['Converting letter.docx 0/1', 'Converting letter.docx 1/1']);
  });

  it('finishes at the denominator the work actually used, never jumping backwards', async () => {
    // What the picture converter does: one report per page of a 3-page TIFF.
    const pdf = await realPdf(3);
    registry.engine = {
      id: 'stub',
      label: 'Built-in picture converter',
      extensions: ['.tif'],
      note: () => 'stub',
      available: () => Promise.resolve(true),
      run: () => {
        for (const page of [1, 2, 3]) reportConvertProgress('Converting scan.tif', page, 3);
        return Promise.resolve(pdf);
      },
    };
    const seen: string[] = [];
    setConvertProgressSink((_phase, current, total) => seen.push(`${current}/${total}`));

    await convertToPdf('/matters/scan.tif');
    setConvertProgressSink(() => undefined);

    expect(seen).toEqual(['0/1', '1/3', '2/3', '3/3', '3/3']);
  });

  it('refuses a 0-byte result and names the program that produced it', async () => {
    engineProducing(new Uint8Array(0));

    await expect(convertToPdf('/matters/letter.docx')).rejects.toThrow(
      /Microsoft Word produced an empty PDF for letter\.docx/i
    );
  });

  it('refuses a result that is not a PDF at all', async () => {
    engineProducing(new TextEncoder().encode('Sorry, something went wrong.'));

    await expect(convertToPdf('/matters/letter.docx')).rejects.toThrow(/cannot read as a PDF/i);
  });

  it('refuses a PDF with no pages in it', async () => {
    // A real PDF whose page tree is empty. pdf-lib's own `create().save()` will
    // NOT do: reloading that reports one page, so it would not exercise this.
    engineProducing(
      new TextEncoder().encode(
        [
          '%PDF-1.7',
          '1 0 obj',
          '<< /Type /Catalog /Pages 2 0 R >>',
          'endobj',
          '2 0 obj',
          '<< /Type /Pages /Kids [] /Count 0 >>',
          'endobj',
          'trailer',
          '<< /Size 3 /Root 1 0 R >>',
          '%%EOF',
          '',
        ].join('\n')
      )
    );

    await expect(convertToPdf('/matters/letter.docx')).rejects.toThrow(/no pages came out/i);
  });

  it('a progress listener that throws cannot break a conversion', async () => {
    engineProducing(await realPdf(2));
    setConvertProgressSink(() => {
      throw new Error('the window went away');
    });

    const result = await convertToPdf('/matters/letter.docx');
    setConvertProgressSink(() => undefined);

    expect(result.pageCount).toBe(2);
  });
});

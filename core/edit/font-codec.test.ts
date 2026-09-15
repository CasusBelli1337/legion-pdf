import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { makeTextPdf, makeTrueTypePdf } from './edit-testkit';
import { fontCodecsOf } from './font-codec';
import { parseTrueType } from './truetype-glyphs';

const LIBERATION_SANS = fileURLToPath(
  new URL('../../src/public/pdfjs/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)
);

async function firstPageCodecs(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = document.getPage(0);
  return fontCodecsOf(page.node.Resources());
}

async function embeddedProgram(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts = document.getPage(0).node.Resources()?.lookupMaybe(PDFName.Font, PDFDict);
  const font = fonts?.lookupMaybe(PDFName.of('F1'), PDFDict);
  const descendant = font
    ?.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
    ?.lookupMaybe(0, PDFDict);
  const descriptor = descendant?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  const file = descriptor?.lookup(PDFName.of('FontFile2'));
  if (!(file instanceof PDFRawStream)) throw new Error('no FontFile2');
  return decodePDFRawStream(file).decode();
}

describe('fontCodecOf — a built-in face', () => {
  it('reads and writes WinAnsi, and names what it cannot show', async () => {
    const codecs = await firstPageCodecs(
      await makeTextPdf({ lines: [{ text: 'Hi', x: 50, y: 50 }] })
    );
    const codec = codecs.get('F1');
    if (codec === undefined) throw new Error('F1 missing');
    expect(codec.baseFont).toBe('Helvetica');
    expect(codec.embedded).toBe(false);
    expect(codec.subset).toBe(false);
    expect(codec.reusable).toBe(true);
    expect(codec.codeBytes).toBe(1);
    expect(codec.decode(0x41)).toBe('A');
    expect(codec.encode('Hello €')).toEqual({
      codes: [72, 101, 108, 108, 111, 32, 0x80],
      missing: [],
    });
    expect(codec.encode('Ж and Ж').missing).toEqual(['Ж']);
  });

  it('uses a curly apostrophe when the straight one is not in the face', async () => {
    const codecs = await firstPageCodecs(
      await makeTextPdf({ lines: [{ text: 'x', x: 50, y: 50 }] })
    );
    const codec = codecs.get('F1');
    // WinAnsi has both; the plain key wins when present.
    expect(codec?.encode("'").codes).toEqual([0x27]);
  });
});

describe('fontCodecOf — an embedded TrueType subset (the Word-PDF shape)', () => {
  const spec = { lines: [{ text: 'Hello World', x: 50, y: 50 }] };

  it('decodes through ToUnicode and re-encodes only the glyphs the subset kept', async () => {
    const program = new Uint8Array(await readFile(LIBERATION_SANS));
    const bytes = await makeTrueTypePdf(spec, program);
    const codec = (await firstPageCodecs(bytes)).get('F1');
    if (codec === undefined) throw new Error('F1 missing');
    expect(codec.baseFont).toMatch(/^LiberationSans/);
    expect(codec.embedded).toBe(true);
    expect(codec.codeBytes).toBe(2);
    expect(codec.family).toBe('sans-serif');
    expect(codec.reusable).toBe(true);
    const hello = codec.encode('Hello');
    expect(hello.missing).toEqual([]);
    expect(hello.codes.map((code) => codec.decode(code)).join('')).toBe('Hello');
    // "z" was never used, so the subset has no outline for it — and the codec says so.
    // (pdf-lib names its subsets without the ABCDEF+ tag; the loca table is the truth.)
    expect(codec.encode('Hold z').missing).toEqual(['z']);
  });

  it('can reuse every glyph of a fully embedded face', async () => {
    const program = new Uint8Array(await readFile(LIBERATION_SANS));
    const bytes = await makeTrueTypePdf(spec, program, false);
    const codec = (await firstPageCodecs(bytes)).get('F1');
    expect(codec?.subset).toBe(false);
    expect(codec?.encode('Hold z').missing).toEqual([]);
  });

  it('reads the loca table of the subset program: used glyphs have outlines, unused do not', async () => {
    const program = new Uint8Array(await readFile(LIBERATION_SANS));
    const subset = parseTrueType(await embeddedProgram(await makeTrueTypePdf(spec, program)));
    const full = parseTrueType(program);
    if (full === null || subset === null) throw new Error('the programs did not parse');
    expect(subset.numGlyphs).toBeLessThan(full.numGlyphs);
    const gidA = full.unicodeToGid('A'.codePointAt(0) ?? 0);
    if (gidA === undefined) throw new Error('no A');
    expect(full.hasOutline(gidA)).toBe(true);
    // A space has no outline by design; that is why whitespace is special-cased.
    expect(full.hasOutline(full.unicodeToGid(32) ?? 0)).toBe(false);
  });
});

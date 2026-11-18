import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { LayoutTextRun } from '@shared/types';
import { buildDocx } from './build-docx';
import { FOOTNOTES_NOTE, footnoteBook, separatorHeight } from './docx-footnotes';
import { page, paragraphLines, run } from './layout-testkit';

const RULE = { rect: { x: 72, y: 150, width: 144, height: 0.6 } };

function mark(text: string, x: number, baseline: number): LayoutTextRun {
  return run(text, x, baseline + 4.5, { sizePt: 8, width: 4 });
}

/** A page whose body cites footnote `number`, set under the separator rule. */
function footnotedPage(number: number, pageNumber: number, reference = String(number)) {
  return page(
    [
      ...paragraphLines(3, 700, {
        pitch: 24,
        text: `Body of page ${pageNumber} runs across the measure`,
      }),
      mark(reference, 482, 700),
      mark(String(number), 72, 134),
      ...paragraphLines(2, 134, {
        x: 79,
        pitch: 13.8,
        text: `Fictional note ${number} cites the record`,
      }),
    ],
    { page: pageNumber, rules: [RULE] }
  );
}

async function partsOf(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return {
    document: await read('word/document.xml'),
    footnotes: await read('word/footnotes.xml'),
    settings: await read('word/settings.xml'),
    styles: await read('word/styles.xml'),
  };
}

describe('footnotes in the Word file', () => {
  it('writes each note as a Word footnote tied to its mark, and says so', async () => {
    const build = await buildDocx([footnotedPage(1, 1), footnotedPage(2, 2)]);
    const parts = await partsOf(build.bytes);

    expect(parts.document.match(/<w:footnoteReference w:id="\d+"\/>/g)).toEqual([
      '<w:footnoteReference w:id="1"/>',
      '<w:footnoteReference w:id="2"/>',
    ]);
    expect(parts.document).not.toContain('Fictional note');
    expect(parts.footnotes).toMatch(/<w:footnote w:id="1">.*Fictional note 1 cites/s);
    expect(parts.footnotes).toMatch(/<w:footnote w:id="2">.*Fictional note 2 cites/s);
    // Word writes the number: the printed one is gone from the note's text.
    expect(parts.footnotes).not.toMatch(/<w:t[^>]*>\s*1\s*<\/w:t>/);
    expect(parts.footnotes.match(/<w:footnoteRef\/>/g)).toHaveLength(2);
    expect(build.receipt.kept).toContain(FOOTNOTES_NOTE);
    expect(build.receipt.dropped.join(' ')).not.toContain('footnotes');
  });

  it('sizes the separator exactly and names it in the settings, or Word draws its own', async () => {
    const parts = await partsOf((await buildDocx([footnotedPage(1, 1)])).bytes);
    expect(parts.settings).toContain(
      '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat>'
    );
    const separator = /<w:footnote w:type="separator" w:id="-1">(.*?)<\/w:footnote>/s.exec(
      parts.footnotes
    )?.[1];
    expect(separator).toMatch(/w:line="\d+" w:lineRule="exact"/);
    expect(separator).toContain('<w:separator/>');
    expect(separator).not.toContain('footnoteRef');
  });

  it('sets the last note of a page against the bottom margin with space after', async () => {
    const parts = await partsOf((await buildDocx([footnotedPage(1, 1)])).bytes);
    const spacing = /<w:footnote w:id="1">.*?<w:spacing ([^>]*)\/>/s.exec(parts.footnotes)?.[1];
    expect(spacing).toMatch(/w:line="276" w:lineRule="exact"/);
    expect(spacing).toMatch(/w:after="\d+"/);
  });

  it('styles Word’s own mark after the page’s: raised, in the note’s face and size', async () => {
    const { styles } = await partsOf((await buildDocx([footnotedPage(1, 1)])).bytes);
    const style = /<w:style [^>]*w:styleId="FootnoteReference">.*?<\/w:style>/s.exec(styles)?.[0];
    expect(style).toContain('w:vertAlign w:val="superscript"');
    expect(style).toContain('Times New Roman');
  });

  it('leaves a page’s notes as text when one has no mark above it, and every page after', async () => {
    const build = await buildDocx([
      footnotedPage(1, 1),
      footnotedPage(2, 2, '9'),
      footnotedPage(3, 3),
    ]);
    const parts = await partsOf(build.bytes);
    expect(parts.footnotes.match(/<w:footnote w:id="\d+">/g)).toHaveLength(1);
    expect(parts.document).toContain('Fictional note 2 cites');
    expect(parts.document).toContain('Fictional note 3 cites');
    expect(build.receipt.dropped.join(' ')).toContain('The footnotes on pages 2–3 were left');
  });

  it('writes no footnotes part changes for a document without any', async () => {
    const build = await buildDocx([page(paragraphLines(3, 700))]);
    const parts = await partsOf(build.bytes);
    expect(parts.settings).not.toContain('footnotePr');
    expect(build.notes.join(' ')).not.toContain('ootnote');
  });
});

describe('separatorHeight', () => {
  it('puts the rule where the pages drew it when there is room', () => {
    const book = { ...footnoteBook(), gapPt: 14.3, rises: [5.4, 5.4, 5.5] };
    // (5.4 − 3.1) ÷ 0.2: Word's baseline sits a fifth of the height above the notes.
    expect(separatorHeight(book)).toBeCloseTo(11.5, 1);
  });

  it('never takes more than the tightest page left, less the slack', () => {
    const book = { ...footnoteBook(), gapPt: 9, rises: [6] };
    expect(separatorHeight(book)).toBeCloseTo(7.5, 5);
    expect(separatorHeight({ ...book, gapPt: 0.5 })).toBe(2);
  });
});

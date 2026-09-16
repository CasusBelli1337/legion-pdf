import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { COLUMNS_NOTE, buildDocx } from './build-docx';
import { STAMP_NOTE } from './docx-section';
import { PLEADING_NOTE } from './pleading';
import { verifyDocx } from './verify';
import { image, page, paragraphLines, run } from './layout-testkit';

async function partsOf(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return {
    names: Object.keys(zip.files),
    document: await read('word/document.xml'),
    header: await read('word/header1.xml'),
    footer: await read('word/footer1.xml'),
    styles: await read('word/styles.xml'),
  };
}

describe('buildDocx', () => {
  it('writes real paragraphs in the document font, size, and exact line pitch', async () => {
    const layout = page([...paragraphLines(3, 700, { pitch: 14 }), ...paragraphLines(2, 630)]);
    const build = await buildDocx([layout], { title: 'Brief' });
    const parts = await partsOf(build.bytes);

    expect(build.paragraphCount).toBe(2);
    expect(build.pageCount).toBe(1);
    expect(parts.document).toContain('The quick brown fox');
    expect(parts.document).toContain('w:rFonts w:ascii="Times New Roman"');
    expect(parts.document).toContain('w:sz w:val="24"');
    expect(parts.document).toContain('w:line="280" w:lineRule="exact"');
    expect(parts.document).toContain('w:pgSz w:w="12240" w:h="15840"');
    expect(parts.styles).toContain('Times New Roman');
  });

  it('joins a paragraph’s lines into flowing text and heals a broken word', async () => {
    const layout = page([
      run('I did not read the whole document, only the signa-'.padStart(78, 'A. '), 72, 700),
      run('ture page that he put in front of me.', 72, 686),
    ]);
    const { document } = await partsOf((await buildDocx([layout])).bytes);
    expect(document).toContain('only the signature page');
  });

  it('keeps bold, italic, colour, and underline on the runs that had them', async () => {
    const layout = page(
      [
        run('plain ', 72, 700),
        run('bold', 108, 700, { fontKey: 'timesBold' }),
        run(' red', 132, 700, { colorHex: '#ff0000' }),
        run(' ruled', 156, 700),
      ],
      { rules: [{ rect: { x: 155, y: 698.5, width: 40, height: 0.6 } }] }
    );
    const { document } = await partsOf((await buildDocx([layout])).bytes);
    expect(document).toMatch(/<w:b\/>.{0,200}bold/);
    expect(document).toContain('w:color w:val="FF0000"');
    expect(document).toMatch(/<w:u w:val="single"\/>.{0,200}ruled/);
  });

  it('starts every page after the first on a page break', async () => {
    const first = page(paragraphLines(2, 700), { page: 1 });
    const second = page(paragraphLines(2, 700), { page: 2 });
    const { document } = await partsOf((await buildDocx([first, second])).bytes);
    expect(document.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  });

  it('turns a landscape page into its own section with its own paper', async () => {
    const portrait = page(paragraphLines(2, 700), { page: 1 });
    const landscape = page([run('sideways', 72, 500)], {
      page: 2,
      size: { width: 792, height: 612 },
    });
    const { document } = await partsOf((await buildDocx([portrait, landscape])).bytes);
    expect(document.match(/<w:sectPr/g)).toHaveLength(2);
    expect(document).toContain('w:orient="landscape"');
  });

  it('builds a Word header and footer from the running head and foot, numbering pages itself', async () => {
    const layout = page([
      run('ASHFORD v. ASHFORD', 90, 760, { sizePt: 9, role: 'header' }),
      ...paragraphLines(3, 700),
      run('3', 300, 44, { sizePt: 10, role: 'page-number', width: 5 }),
      run('ABC000123', 430, 30, { sizePt: 9, role: 'stamp' }),
    ]);
    const build = await buildDocx([layout]);
    const parts = await partsOf(build.bytes);
    expect(parts.header).toContain('ASHFORD v. ASHFORD');
    expect(parts.footer).toContain('PAGE');
    expect(parts.footer).not.toContain('>3<');
    expect(parts.document).not.toContain('ABC000123');
    expect(build.notes).toContain(STAMP_NOTE);
  });

  it('rebuilds pleading paper as a header table of numbers on a fixed grid, not Word line numbering', async () => {
    const numbers = Array.from({ length: 28 }, (_unused, index) =>
      run(String(index + 1), 54, 720 - index * 24, { sizePt: 10, role: 'line-number', width: 5 })
    );
    const body = [
      run('Q. Did you sign it?', 90, 720, { sizePt: 11 }),
      run('A. I did.', 90, 696, { sizePt: 11 }),
    ];
    const rules = [
      { rect: { x: 62, y: 20, width: 0.7, height: 750 } },
      { rect: { x: 63.5, y: 20, width: 0.7, height: 750 } },
      { rect: { x: 580, y: 20, width: 0.5, height: 750 } },
    ];
    const build = await buildDocx([page([...numbers, ...body], { rules })]);
    const { document, header } = await partsOf(build.bytes);
    expect(document).not.toContain('w:lnNumType');
    // Line 1's box top is 0.8 × 24 above baseline 720: 739.2 from the bottom, 52.8 pt = 1056 twips from the top, fixed.
    expect(document).toContain('w:top="-1056"');
    expect(document).not.toMatch(/<w:t[^>]*>1<\/w:t>/);
    expect(header).toMatch(/<w:t[^>]*>1<\/w:t>/);
    expect(header).toMatch(/<w:t[^>]*>28<\/w:t>/);
    expect(header).toContain('w:hRule="exact"');
    expect(header).toContain('w:val="double"');
    expect(header).toContain('w:val="single"');
    expect(build.notes).toContain(PLEADING_NOTE);
  });

  it('sets columns with tab stops and says so', async () => {
    const layout = page([
      run('Fee', 72, 700),
      run('$100', 300, 700),
      run('Costs', 72, 686),
      run('$250', 300, 686),
    ]);
    const build = await buildDocx([layout]);
    const { document } = await partsOf(build.bytes);
    expect(document).toContain('<w:tab');
    expect(document).toContain('w:pos="4560"');
    expect(build.notes).toContain(COLUMNS_NOTE);
  });

  it('sets a two-column page in two Word columns with a column break between', async () => {
    const runs = Array.from({ length: 8 }, (_unused, index) =>
      run(
        (index % 2 === 0 ? 'Left ' : 'Right ').padEnd(33, 'x'),
        index % 2 === 0 ? 72 : 342,
        700 - Math.floor(index / 2) * 14
      )
    );
    const { document } = await partsOf((await buildDocx([page(runs)])).bytes);
    expect(document).toContain(
      '<w:cols w:space="1400" w:num="2" w:equalWidth="false"><w:col w:w="4000" w:space="1400"/>'
    );
    expect(document.match(/<w:br w:type="column"\/>/g)).toHaveLength(1);
  });

  it('embeds a picture inline at its size', async () => {
    const layout = page(paragraphLines(2, 700), { images: [image(72, 400, 144, 72)] });
    const build = await buildDocx([layout]);
    const parts = await partsOf(build.bytes);
    expect(parts.names.some((name) => name.startsWith('word/media/'))).toBe(true);
    expect(parts.document).toContain('<wp:extent cx="1828800" cy="914400"/>');
  });

  it('still turns the paper for an empty page', async () => {
    const build = await buildDocx([page([]), page([], { page: 2 })]);
    expect(build.paragraphCount).toBe(2);
  });

  it('refuses to export nothing', async () => {
    await expect(buildDocx([])).rejects.toThrow(/no pages/);
  });
});

describe('verifyDocx', () => {
  it('refuses a file that lacks the text that was built', async () => {
    const build = await buildDocx([page(paragraphLines(1, 700))]);
    await expect(
      verifyDocx(build.bytes, { paragraphCount: 1, samples: ['text that is not there'] })
    ).rejects.toThrow(/did not make it/);
    await expect(verifyDocx(build.bytes, { paragraphCount: 50, samples: [] })).rejects.toThrow(
      /holds 1 paragraphs where 50/
    );
    await expect(verifyDocx(new Uint8Array(), { paragraphCount: 0, samples: [] })).rejects.toThrow(
      /empty/
    );
  });
});

describe('buildDocx — scanner noise in the foot', () => {
  it('keeps the footer to real words: recognised fragments with no three letters or digits are left out', async () => {
    const layout = page([
      run('Body text on the page', 90, 700),
      run('DEFENDANT HALVERSON DYNAMICS, INC.’S CROSS-COMPLAINT', 200, 30, {
        role: 'footer',
        hidden: true,
      }),
      run('H', 40, 60, { role: 'footer', hidden: true }),
      run('KL', 40, 48, { role: 'footer', hidden: true }),
      run(')', 40, 36, { role: 'footer', hidden: true }),
      run('AHCIB-IU A T LA W', 40, 24, { role: 'footer', hidden: true }),
    ]);
    const build = await buildDocx([layout]);
    const { footer } = await partsOf(build.bytes);
    expect(footer).toContain('CROSS-COMPLAINT');
    expect(footer).toContain('AHCIB-IU');
    expect(footer).not.toMatch(/<w:t[^>]*>KL<\/w:t>/);
    expect(footer).not.toMatch(/<w:t[^>]*>H<\/w:t>/);
  });
});

describe('buildDocx — the foot never pushes the body', () => {
  it('widens the bottom margin to the footer’s reach when the foot sits high on the page', async () => {
    const layout = page([
      ...paragraphLines(3, 700),
      run('FIRM SLUG LINE ONE', 90, 120, { role: 'footer', sizePt: 6 }),
      run('FIRM SLUG LINE TWO', 90, 112, { role: 'footer', sizePt: 6 }),
      run('DOCUMENT TITLE IN THE FOOT', 200, 100, { role: 'footer', sizePt: 8 }),
    ]);
    const { document } = await partsOf((await buildDocx([layout])).bytes);
    const bottom = Number(/w:bottom="(-?\d+)"/.exec(document)?.[1]);
    const footer = Number(/w:footer="(-?\d+)"/.exec(document)?.[1]);
    // The foot's top edge is about 125 pt (2500 twips) up the page; the body must stop above it.
    expect(bottom).toBeGreaterThanOrEqual(2480);
    expect(footer).toBeLessThan(bottom);
  });
});

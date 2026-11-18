/**
 * How filings number their pages (fictional parties throughout): roman front
 * matter, a restart, a scan whose numbers the recognition read in pieces.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from './build-docx';
import { PAGE_NUMBERS_NOTE, SLUG_NOTE } from './docx-footer';
import { opensNumbering } from './first-page-foot';
import { page, paragraphLines, run } from './layout-testkit';
import { numberingRuns, romanValue, withFootNumbers } from './page-numbering';

const TITLE = 'REPLY IN SUPPORT OF MOTION TO COMPEL';

/** A brief's page: the title at the foot, and `mark` — "i", "3", nothing — above it. */
function sheet(index: number, mark: string | null, printed: number | null = null) {
  const role = printed === null ? 'footer' : 'page-number';
  return page(
    [
      ...paragraphLines(3, 700),
      run(TITLE, 150, 30, { role: 'footer', sizePt: 10 }),
      ...(mark === null ? [] : [run(mark, 303, 46, { role, width: 6 })]),
    ],
    { page: index, printedPageNumber: printed }
  );
}

async function partsOf(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((name) => /word\/footer\d*\.xml$/.test(name));
  return {
    document: await zip.file('word/document.xml')!.async('string'),
    footers: await Promise.all(names.map((name) => zip.file(name)!.async('string'))),
  };
}

describe('romanValue', () => {
  it('reads small roman numerals and refuses words that merely use the letters', () => {
    expect(romanValue('i')).toBe(1);
    expect(romanValue('iv')).toBe(4);
    expect(romanValue('xiv')).toBe(14);
    expect(romanValue('ill')).toBeNull();
    expect(romanValue('vv')).toBeNull();
  });
});

describe('a brief with roman front matter', () => {
  const brief = [sheet(1, null), sheet(2, 'i'), sheet(3, 'ii'), sheet(4, '1', 1), sheet(5, '2', 2)];

  it('reads the roman numbers the viewer does not', () => {
    const read = withFootNumbers(brief);
    expect(read.map((each) => each.printedPageNumber)).toEqual([null, 1, 2, 1, 2]);
  });

  it('cuts the pages where the numbering changes, the caption page with the tables', () => {
    const runs = numberingRuns(withFootNumbers(brief), opensNumbering);
    expect(runs.map((pages) => pages.map((each) => each.page))).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it('counts i, ii, then 1, 2 in Word, each a page field, and leaves nothing out', async () => {
    const build = await buildDocx(brief);
    const { document, footers } = await partsOf(build.bytes);
    expect(document).toMatch(/<w:pgNumType w:start="0" w:fmt="lowerRoman"\/>/);
    expect(document).toMatch(/<w:pgNumType w:start="1" w:fmt="decimal"\/>/);
    expect(document).toContain('<w:titlePg/>');
    expect(footers.filter((footer) => footer.includes('PAGE'))).toHaveLength(2);
    expect(footers.join('')).not.toMatch(/>ii?</);
    expect(build.notes).not.toContain(PAGE_NUMBERS_NOTE);
    expect(build.pageCount).toBe(5);
  });

  it('keeps unnumbered pages behind the argument out of its count', () => {
    const runs = numberingRuns(
      withFootNumbers([sheet(1, '1', 1), sheet(2, '2', 2), sheet(3, null), sheet(4, null)]),
      opensNumbering
    );
    expect(runs.map((pages) => pages.length)).toEqual([2, 2]);
  });
});

describe('pages that only look as if they restart', () => {
  it('leaves a phone number printed on every page alone', () => {
    const pages = [sheet(1, '555', 555), sheet(2, '555', 555), sheet(3, '555', 555)];
    expect(numberingRuns(pages, opensNumbering)).toHaveLength(1);
  });
});

describe('a foot that opens "Page N"', () => {
  const labelled = (index: number) =>
    page(
      [
        ...paragraphLines(3, 700),
        run(`Page ${index} - Case No. 24-CV-0101`, 89, 36, { role: 'footer', sizePt: 10 }),
        run('Cross-Complaint of Harbor Freight Lines, Inc.', 89, 24, {
          role: 'footer',
          sizePt: 10,
        }),
      ],
      { page: index }
    );

  it('counts with the pages instead of printing one page’s label on all of them', async () => {
    const build = await buildDocx([labelled(1), labelled(2), labelled(3)]);
    const { document, footers } = await partsOf(build.bytes);
    expect(footers).toHaveLength(1);
    expect(footers[0]).toMatch(/Page <\/w:t>.*PAGE.*> - Case No\. 24-CV-0101</s);
    expect(footers[0]).not.toContain('Page 1');
    expect(document).toMatch(/<w:pgNumType w:start="1" w:fmt="decimal"\/>/);
  });

  it('is not fooled by "Page 4 of 10", which the viewer already reads', () => {
    const of = page([run('Page 4 of 10', 280, 36, { role: 'footer' })], { page: 4 });
    expect(withFootNumbers([of])[0]?.printedPageNumber).toBeNull();
  });
});

/** A scanned pleading page: 28 recognised line numbers, and its foot well clear of the paper's edge. */
function scan(index: number, foot: string, pieces: string[]) {
  const hidden = { hidden: true } as const;
  const numbers = Array.from({ length: 28 }, (_unused, line) =>
    run(String(line + 1), 118, 716 - line * 21.5, { ...hidden, role: 'line-number', width: 8 })
  );
  const number = pieces.map((piece, at) =>
    run(piece, 337 + at * 8, 114, { ...hidden, role: 'footer', sizePt: 6, width: 6 })
  );
  return page(
    [
      ...numbers,
      run('Recognised words of the body.', 140, 500, hidden),
      run('GRAYSON & HOLT', 60, 108, { ...hidden, role: 'footer', sizePt: 5, width: 40 }),
      run('4100-2200-0001.1', 137, 113, { ...hidden, role: 'footer', sizePt: 7, width: 50 }),
      ...number,
      run(foot, 176, 100, { ...hidden, role: 'footer', sizePt: 9.5 }),
    ],
    { page: index }
  );
}

describe('a scanned pleading', () => {
  const RUNNING = 'DEFENDANT HARBOR FREIGHT LINES, INC.’S AMENDED CROSS-COMPLAINT';
  const pages = [
    scan(1, 'DEFENDANT HARBOR FREIGHT LINES, INC.’S CROSS-COMPLAINT FOR BREACH', []),
    scan(2, RUNNING, ['-2', '-']),
    scan(3, 'DEFENDANT HARB0R FRElGHT LINES, lNC.’S AMENDED CROSS-COMPLAINT', ['-', '3', '-']),
    scan(4, RUNNING, []),
    scan(5, RUNNING, ['-5', '—']),
    scan(6, 'DEFE DANT HARBOR FRE', []),
  ];

  it('reads a number handed over in pieces, and the ones the recognition missed', () => {
    const read = withFootNumbers(pages);
    expect(read.map((each) => each.printedPageNumber)).toEqual([null, 2, 3, 4, 5, 6]);
    const number = read[1]?.runs.find((each) => each.role === 'page-number');
    expect(number?.text).toBe('- 2 -');
    expect(number?.sizePt).toBe(9.5);
  });

  it('carries the foot into Word: the clearest reading, numbered, the caption page its own', async () => {
    const build = await buildDocx(pages);
    const { document, footers } = await partsOf(build.bytes);
    expect(document.match(/<w:sectPr/g)).toHaveLength(1);
    expect(document).toContain('<w:titlePg/>');
    const running = footers.find((footer) => footer.includes('PAGE')) ?? '';
    expect(running).toContain('AMENDED CROSS-COMPLAINT');
    expect(running).not.toContain('HARB0R');
    expect(footers.some((footer) => footer.includes('FOR BREACH'))).toBe(true);
  });

  it('leaves the unreadable slug in the margin out, and says so', async () => {
    const build = await buildDocx(pages);
    expect((await partsOf(build.bytes)).footers.join('')).not.toContain('GRAYSON');
    expect(build.notes).toContain(SLUG_NOTE);
  });
});

describe('a foot whose rule runs between the page number and the title', () => {
  const ruled = (index: number) =>
    page(
      [
        ...paragraphLines(3, 700),
        run('*0420', 88, 46, { role: 'footer', sizePt: 7, width: 20 }),
        run(String(index), 303, 46, { role: 'page-number', width: 6 }),
        run(TITLE, 216, 28, { role: 'footer', sizePt: 10 }),
      ],
      {
        page: index,
        printedPageNumber: index,
        rules: [{ rect: { x: 85, y: 41, width: 450, height: 0.5 } }],
      }
    );

  it('draws the rule over the title, and gives the number room to reach two digits', async () => {
    const build = await buildDocx([ruled(1), ruled(2)]);
    const [footer = ''] = (await partsOf(build.bytes)).footers;
    const paragraphs = footer.match(/<w:p>.*?<\/w:p>/gs) ?? [];
    expect(paragraphs[0]).toContain('PAGE');
    expect(paragraphs[0]).not.toContain('<w:pBdr>');
    expect(paragraphs[0]).not.toMatch(/w:right="[1-9]/);
    expect(paragraphs[1]).toContain('<w:pBdr>');
  });
});

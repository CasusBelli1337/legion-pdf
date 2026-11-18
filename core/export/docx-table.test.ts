import { describe, expect, it } from 'vitest';
import { Document, Packer } from 'docx';
import type { LayoutRule, LayoutTextRun } from '@shared/types';
import { docxTable } from './docx-table';
import { FONTS, run } from './layout-testkit';
import { linesOf } from './lines';
import type { BodyFrame, TableParagraph } from './model';
import { ruledTablesOf } from './tables';
import { documentXmlOf } from './verify';

/** A rule as the operator walk reports one: a thin box, PDF coordinates. */
function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

const FRAME: BodyFrame = { left: 72, right: 540, textRight: 540 };

/** A caption box: 3 rows of 40 pt, 2 columns of 234 pt, every edge drawn. */
const CAPTION: LayoutRule[] = [
  rule(72, 700, 468, 0),
  rule(72, 660, 468, 0),
  rule(72, 620, 468, 0),
  rule(72, 580, 468, 0),
  rule(72, 580, 0, 120),
  rule(306, 580, 0, 120),
  rule(540, 580, 0, 120),
];

const CAPTION_RUNS: LayoutTextRun[] = [
  run('JANE DOE, Plaintiff,', 80, 690),
  run('Case No. 24-CV-0001', 316, 690),
  run('v.', 80, 645),
  run('PROOF OF SERVICE', 316, 645),
  run('JOHN ROE, Defendant.', 80, 600),
  run('Dept. 21', 316, 600),
];

function tableOf(rules: LayoutRule[] = CAPTION, runs: LayoutTextRun[] = CAPTION_RUNS) {
  const table = ruledTablesOf(linesOf(runs, rules), rules, FRAME).tables[0];
  if (table === undefined) throw new Error('the fixture did not produce a table');
  return table;
}

/** The table packed into a real .docx and read back — what Word will actually see. */
async function xmlOf(table: TableParagraph, pageBreakBefore = false): Promise<string> {
  const document = new Document({
    sections: [{ children: [docxTable(table, FONTS, { pageBreakBefore })] }],
  });
  return documentXmlOf(new Uint8Array(await Packer.toBuffer(document)));
}

function count(xml: string, pattern: RegExp): number {
  return xml.match(pattern)?.length ?? 0;
}

describe('docxTable', () => {
  it('writes a real Word table: fixed layout, a cell per grid cell, the text in it', async () => {
    const xml = await xmlOf(tableOf());
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(count(xml, /<w:tc>/g)).toBe(6);
    expect(count(xml, /<w:tr>/g)).toBe(3);
    expect(count(xml, /<w:gridCol w:w="4680"\/>/g)).toBe(2);
    expect(xml).toContain('JANE DOE, Plaintiff,');
    expect(xml).toContain('Case No. 24-CV-0001');
    expect(xml).toContain('Dept. 21');
  });

  it('gives every row the exact height the rules gave it, so the grid cannot grow', async () => {
    const xml = await xmlOf(tableOf());
    // The last row gives up the half point Word adds for the table's bottom rule.
    expect(count(xml, /<w:trHeight w:val="800" w:hRule="exact"\/>/g)).toBe(2);
    expect(count(xml, /<w:trHeight w:val="790" w:hRule="exact"\/>/g)).toBe(1);
  });

  it('rules the edges the page drew and leaves the others open', async () => {
    const open = CAPTION.filter((edge) => !(edge.rect.width === 0 && edge.rect.x === 72));
    const [borders = ''] =
      (await xmlOf(tableOf(open))).match(/<w:tcBorders>.*?<\/w:tcBorders>/) ?? [];
    expect(borders).toContain('<w:top w:val="single" w:color="auto" w:sz="4"/>');
    expect(borders).toContain('<w:left w:val="nil" w:color="auto" w:sz="0"/>');
    expect(borders).toContain('<w:right w:val="single" w:color="auto" w:sz="4"/>');
  });

  it('insets the text from its rule by the gap the page kept, and no more', async () => {
    const xml = await xmlOf(tableOf());
    expect(xml).toContain('<w:left w:type="dxa" w:w="160"/>');
    expect(xml).toContain('<w:top w:type="dxa" w:w="0"/>');
  });

  it('indents the table to its first column edge', async () => {
    const inset: LayoutRule[] = [
      rule(144, 700, 396, 0),
      rule(144, 660, 396, 0),
      rule(144, 620, 396, 0),
      rule(144, 580, 396, 0),
      rule(144, 580, 0, 120),
      rule(378, 580, 0, 120),
      rule(540, 580, 0, 120),
    ];
    const runs = CAPTION_RUNS.map((item) => ({ ...item, x: item.x + 72 }));
    expect(await xmlOf(tableOf(inset, runs))).toContain('<w:tblInd w:type="dxa" w:w="1440"/>');
  });

  it('opens a page on the first paragraph of the first cell, and nowhere else', async () => {
    const xml = await xmlOf(tableOf(), true);
    expect(count(xml, /<w:pageBreakBefore\/>/g)).toBe(1);
    expect(xml.indexOf('<w:pageBreakBefore/>')).toBeLessThan(xml.indexOf('JANE DOE'));
  });

  it('leaves the page break out when the table does not open a page', async () => {
    expect(await xmlOf(tableOf())).not.toContain('<w:pageBreakBefore/>');
  });

  it('gives an empty cell a paragraph of its own: Word refuses a cell without one', async () => {
    const sparse = CAPTION_RUNS.filter((item) => item.x < 300);
    const xml = await xmlOf(tableOf(CAPTION, sparse));
    expect(count(xml, /<w:tc>/g)).toBe(6);
    expect(count(xml, /<w:p[\s/>]/g)).toBe(6);
  });

  it('leaves two short lines in a cell as two lines, neither of them justified', async () => {
    // Measured in real Word: read against the longest line instead of the rule,
    // the pair reads as a justified paragraph and Word spreads the first line
    // to the rule and rewraps the second.
    const runs = [...CAPTION_RUNS, run('and DOE COMPANIES 1-10,', 80, 675)];
    const xml = await xmlOf(tableOf(CAPTION, runs));
    const [cell = ''] = xml.match(/<w:tc>.*?<\/w:tc>/) ?? [];
    expect(count(cell, /<w:p[\s/>]/g)).toBe(2);
    expect(cell).not.toContain('<w:jc w:val="both"/>');
    expect(cell).toContain('JANE DOE, Plaintiff,');
    expect(cell).toContain('and DOE COMPANIES 1-10,');
  });

  it('settles a second line in a cell where the page had it', async () => {
    const runs = [...CAPTION_RUNS, run('and DOE COMPANIES 1-10,', 80, 675)];
    const xml = await xmlOf(tableOf(CAPTION, runs));
    // The first line sits 9.5 pt under the row's top rule: handed the cell's
    // 15 pt pitch its box would start above the rule and Word would set the
    // line 2 pt low, so it takes a 12 pt box (240 twips) — the room it had.
    // The second line, 15 pt below (690, 675), keeps the 15 pt pitch (300)
    // and the 0.6 pt that is left between the two boxes.
    expect(xml).toContain('<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="exact"/>');
    expect(xml).toContain('<w:spacing w:after="0" w:before="12" w:line="300" w:lineRule="exact"/>');
  });

  it('keeps a lone line on the pitch it followed, not the cell\u2019s median', async () => {
    // A caption cell runs 12 pt inside a block and 24 pt between blocks; a
    // lone line given the median would be pushed down the cell by Word.
    const runs = [...CAPTION_RUNS, run('and DOE COMPANIES 1-10,', 80, 678)];
    const xml = await xmlOf(tableOf(CAPTION, runs));
    expect(xml).toContain('w:line="240"');
  });
});

describe('docxTable — a lone line above a tighter one', () => {
  it('never gives a line a taller box than the gap to the line below it', async () => {
    // "ACME, INC., a" sits 24 pt under "v." and 12 pt over "Delaware corporation,":
    // on the cell's 24 pt median pitch its box reached into the next line's,
    // and Word pushed that line (and the rest of the cell) 2.4 pt down.
    const runs = [
      run('JANE DOE,', 80, 690),
      run('Plaintiff,', 80, 666),
      run('v.', 80, 642),
      run('ACME, INC., a', 80, 618),
      run('Delaware corporation,', 80, 606),
      run('Case No. 24-CV-0001', 316, 690),
      run('PROOF OF SERVICE', 316, 585),
      run('Dept. 21', 316, 545),
    ];
    const rules = [
      rule(72, 700, 468, 0),
      rule(72, 600, 468, 0),
      rule(72, 560, 468, 0),
      rule(72, 520, 468, 0),
      rule(72, 520, 0, 180),
      rule(306, 520, 0, 180),
      rule(540, 520, 0, 180),
    ];
    const xml = await xmlOf(tableOf(rules, runs));
    const [cell = ''] = xml.match(/<w:tc>.*?<\/w:tc>/) ?? [];
    const acme = cell.slice(0, cell.indexOf('ACME')).split('<w:p>').at(-1) ?? '';
    expect(acme).toContain('w:line="240"');
  });
});

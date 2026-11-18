/**
 * What real briefs taught the export (fictional parties throughout): each
 * test is a page that came out wrong in real Word, reduced to its geometry.
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocx } from './build-docx';
import { PAGE_NUMBERS_NOTE } from './docx-footer';
import { ruleSpace } from './footer-rule';
import { page, paragraphLines, run } from './layout-testkit';
import { linesOf } from './lines';
import { pageParagraphs, settlePage } from './page-paragraphs';
import { columnRunsOf, sectionGeometry, withVerticalMargins } from './page-setup';
import { alignmentOf, paragraphsOf } from './paragraphs';

const FRAME = { left: 72, right: 540, textRight: 540 };

function numbers(firstBaseline = 716, count = 28, pitch = 24) {
  return Array.from({ length: count }, (_unused, index) =>
    run(String(index + 1), 54, firstBaseline - index * pitch, { role: 'line-number', width: 6 })
  );
}

async function partsOf(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  const read = async (pattern: RegExp) =>
    Promise.all(
      names.filter((name) => pattern.test(name)).map((n) => zip.file(n)!.async('string'))
    );
  return {
    document: (await read(/word\/document\.xml$/))[0] ?? '',
    footers: await read(/word\/footer\d*\.xml$/),
  };
}

describe('paragraph widths', () => {
  const full = 'x'.repeat(70);

  it('reads a justified block quote whose first line is indented as justified', () => {
    const lines = linesOf([
      run('x'.repeat(64), 108, 700, { width: 384 }),
      run(full, 72, 686, { width: 420 }),
      run(full, 72, 672, { width: 420 }),
      run('short last line.', 72, 658),
    ]);
    expect(alignmentOf(lines, FRAME)).toBe('justify');
  });

  it('gives a justified paragraph no slack for the next line’s first word to climb into', () => {
    const lines = linesOf([
      run(full, 72, 700, { width: 420 }),
      run(full, 72, 686, { width: 420 }),
      run(full, 72, 672, { width: 420 }),
      run('short last line.', 72, 658),
    ]);
    const [paragraph] = paragraphsOf(lines, { frame: FRAME });
    expect(paragraph?.indentRightPt).toBeCloseTo(540 - 493, 6);
  });

  it('sets a paragraph exactly as much wider as Word sets the page’s face', () => {
    const lines = linesOf([run(full, 72, 700, { width: 420 }), run('and a short line', 72, 686)]);
    const [paragraph] = paragraphsOf(lines, { frame: FRAME, widthScale: 1.01 });
    expect(paragraph?.indentRightPt).toBeCloseTo(540 - (72 + 1.01 * 420 + 1), 6);
  });
});

describe('a block quote hard against the paragraph under it', () => {
  it('tightens the quote by a hair instead of every line of the paragraph below', () => {
    // Five single-spaced lines, then double-spaced text 19 pt under the last:
    // the lower paragraph's 24 pt box needs 22.1.
    const tagged = (id: string) => (entry: ReturnType<typeof run>) => ({
      ...entry,
      block: { id, role: 'paragraph' as const },
    });
    const quote = paragraphLines(5, 700, { x: 108, pitch: 14.4 }).map(tagged('b1'));
    const body = paragraphLines(3, 623.4, { pitch: 24 }).map(tagged('b2'));
    const layout = page([...quote, ...body]);
    const geometry = sectionGeometry([layout]);
    const settled = settlePage(pageParagraphs(layout, geometry), 760);
    const [upper, lower] = settled;
    expect(upper?.kind === 'text' ? upper.leadingPt : 0).toBeGreaterThan(13.4);
    expect(upper?.kind === 'text' ? upper.leadingPt : 0).toBeLessThan(14.4);
    expect(lower?.kind === 'text' ? lower.leadingPt : 0).toBe(24);
  });
});

describe('pleading paper whose text sits above its numbers', () => {
  it('starts the body at the first line’s box, not two points lower at line 1’s', () => {
    // Numbers on 716, 692…; the text 2.6 pt higher on every line.
    const text = paragraphLines(9, 718.6, { x: 100, pitch: 24 });
    const layout = page([...numbers(), ...text]);
    const provisional = sectionGeometry([layout]);
    const built = pageParagraphs(layout, provisional);
    const geometry = withVerticalMargins(provisional, [built.box]);
    expect(792 - geometry.margins.top).toBeCloseTo(718.6 + 0.8 * 24, 6);
    const [first] = settlePage(built, 792 - geometry.margins.top);
    expect(first?.kind === 'text' ? first.leadingPt : 0).toBe(24);
  });

  it('reads a signature block set left and right of a tab as one column', () => {
    const layout = page([
      ...numbers(700, 8),
      run('Dated: October 30, 2026', 108, 700),
      run('PERRIN & VALE LLP', 360, 700),
      run('By:', 360, 628),
      run('Attorneys for Defendant', 386, 556),
    ]);
    expect(columnRunsOf(layout)).toHaveLength(1);
  });
});

describe('footnotes', () => {
  it('gives a one-line footnote under the last number a single-spaced box', () => {
    const body = paragraphLines(28, 716, { x: 100, pitch: 24 });
    const note = run('A one-line footnote in ten point type.', 100, 30, { sizePt: 10 });
    const layout = page([...numbers(), ...body, note]);
    const built = pageParagraphs(layout, sectionGeometry([layout]));
    const last = built.columns[0]?.at(-1);
    expect(last?.kind === 'text' ? last.leadingPt : 0).toBeCloseTo(12, 6);
    expect(last?.kind === 'text' ? last.unnumbered : false).toBe(true);
  });

  it('lets the footer’s rule give way to a last line that ends hard against it', () => {
    const tight = page([run('the last footnote line', 100, 64.8, { sizePt: 10 })]);
    // The rule sat 14 pt above the footer's text (top at 48); the body ends at 62.3.
    expect(ruleSpace(14, 48, [tight])).toBe(12);
    const roomy = page([run('the last body line', 100, 200)]);
    expect(ruleSpace(14, 48, [roomy])).toBe(14);
  });
});

describe('page numbers', () => {
  function sheet(index: number, printed: number | null) {
    return page(
      [
        ...paragraphLines(3, 700),
        run('MEMORANDUM OF POINTS AND AUTHORITIES', 105, 30, { role: 'footer', sizePt: 10 }),
        ...(printed === null ? [] : [run(`- ${printed} -`, 300, 46, { role: 'page-number' })]),
      ],
      { page: index, printedPageNumber: printed }
    );
  }

  it('keeps the numbers on pages 2, 3… when the caption page has none: a first-page footer', async () => {
    const build = await buildDocx([sheet(1, null), sheet(2, 2), sheet(3, 3)]);
    const parts = await partsOf(build.bytes);
    expect(parts.document).toContain('<w:titlePg/>');
    expect(parts.footers.filter((footer) => footer.includes('PAGE'))).toHaveLength(1);
    expect(parts.footers.filter((footer) => footer.includes('MEMORANDUM'))).toHaveLength(2);
  });

  it('starts an excerpt’s numbering where its pages printed it', async () => {
    const build = await buildDocx([sheet(1, 45), sheet(2, 46)]);
    expect((await partsOf(build.bytes)).document).toContain('w:start="45"');
  });

  it('leaves out numbers that restart, and says so, rather than print one page’s on all', async () => {
    const build = await buildDocx([sheet(1, 1), sheet(2, 1), sheet(3, 2)]);
    const parts = await partsOf(build.bytes);
    expect(parts.footers.some((footer) => footer.includes('PAGE'))).toBe(false);
    expect(parts.footers.join('')).not.toContain('- 1 -');
    expect(build.notes).toContain(PAGE_NUMBERS_NOTE);
  });
});

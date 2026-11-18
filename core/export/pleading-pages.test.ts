import { describe, expect, it } from 'vitest';
import { page, run } from './layout-testkit';
import { pageParagraphs, settlePage } from './page-paragraphs';
import { groupSections, sectionGeometry, withVerticalMargins } from './page-setup';
import { pleadingOf } from './pleading';
import { pleadingPagesOf, sameGrid } from './pleading-pages';
import type { PageLayout } from '@shared/types';

interface Sheet {
  first?: number;
  pitch?: number;
  height?: number;
  extra?: ReturnType<typeof run>[];
}

/** Pleading paper with one line of text beside every number, line 1 at `first`. */
function sheet({ first = 720, pitch = 24, height = 792, extra = [] }: Sheet = {}): PageLayout {
  const lines = Array.from({ length: 28 }, (_unused, index) => [
    run(String(index + 1), 54, first - index * pitch, { role: 'line-number', width: 6 }),
    run('The parties agreed to the terms', 90, first - index * pitch),
  ]).flat();
  return page([...lines, ...extra], { size: { width: 612, height } });
}

const bodyYs = (layout: PageLayout): number[] =>
  layout.runs.filter((entry) => entry.role === 'body').map((entry) => entry.y);

describe('pleadingPagesOf — scanned pages onto one grid', () => {
  it('moves a page that sat lower on the scanner glass up onto the section grid, text and all', () => {
    const onGrid = sheet();
    const pages = pleadingPagesOf([onGrid, sheet(), sheet({ first: 717.4 })]);
    expect(pleadingOf(pages[2] as PageLayout)?.firstBaseline).toBeCloseTo(720, 5);
    expect(Math.max(...bodyYs(pages[2] as PageLayout))).toBeCloseTo(720, 5);
    // The pages already on the grid are the very same objects.
    expect(pages[0]).toBe(onGrid);
  });

  it('measures from the top edge: a sheet scanned a point taller is read on the section’s paper', () => {
    // Line 1 is 72 pt below the top of both sheets; from the bottom they differ by a point.
    const pages = pleadingPagesOf([sheet(), sheet(), sheet({ first: 721, height: 793 })]);
    expect(pleadingOf(pages[2] as PageLayout)?.firstBaseline).toBeCloseTo(720, 5);
  });

  it('leaves alone a page whose grid is half a line away: that is another layout, not wobble', () => {
    const far = sheet({ first: 700 });
    expect(pleadingPagesOf([sheet(), sheet(), far])[2]).toBe(far);
  });

  it('returns the pages untouched when the section has no numbered grid', () => {
    const plain = [page([run('A letter with no numbered lines at all', 72, 700)])];
    expect(pleadingPagesOf(plain)).toBe(plain);
  });
});

describe('pleadingPagesOf — the last line under number 28', () => {
  const under = (text: string, y: number) => run(text, 90, y, { role: 'footer' });

  it('gives back to the body a line just under the last number that no other page repeats', () => {
    const first = sheet({ extra: [under('petition asserting that the trust was revoked', 62)] });
    const [page1] = pleadingPagesOf([first, sheet()]);
    const line = page1?.runs.find((entry) => entry.text.startsWith('petition asserting'));
    expect(line?.role).toBe('body');
  });

  it('keeps a running foot in the footer: repeated on other pages, or well below the last line', () => {
    const repeated = (n: number) => under(`Page ${n} - Case No. 24-CV-00123`, 62);
    const low = under('COMPLAINT FOR DAMAGES', 30);
    // A scanned foot never reads the same twice: it is known by its small type and its place in the margin.
    const slug = run('Meridian Harbor LLP 4471-0032', 40, 64, { role: 'footer', sizePt: 6 });
    const small = run('First Amended Complaint', 200, 58, { role: 'footer', sizePt: 8 });
    const pages = pleadingPagesOf([
      sheet({ extra: [repeated(1), low, slug, small] }),
      sheet({ extra: [repeated(2)] }),
    ]);
    const feet = pages[0]?.runs.filter((entry) => entry.role === 'footer').map((e) => e.text);
    expect(feet).toEqual([
      'Page 1 - Case No. 24-CV-00123',
      'COMPLAINT FOR DAMAGES',
      'Meridian Harbor LLP 4471-0032',
      'First Amended Complaint',
    ]);
  });
});

describe('sections and spacing on a numbered grid', () => {
  it('starts a new section where the numbered grid changes pitch', () => {
    const pages = [sheet(), sheet(), sheet({ pitch: 22.8 })];
    expect(sameGrid(pages[0] as PageLayout, pages[1] as PageLayout)).toBe(true);
    expect(groupSections(pages).map((group) => group.length)).toEqual([2, 1]);
  });

  it('carries leftover space too small to set, so short paragraphs do not ride up the page', () => {
    // Recognised baselines a quarter point further apart than the pitch, every line its own paragraph.
    const lines = Array.from({ length: 28 }, (_unused, index) => [
      run(String(index + 1), 54, 720 - index * 24, { role: 'line-number', width: 6 }),
      run('Recognised text.', 90, 720 - index * 24.25, { hidden: true }),
    ]).flat();
    const provisional = sectionGeometry([page(lines)]);
    const built = pageParagraphs(provisional.pages[0] as PageLayout, provisional);
    const geometry = withVerticalMargins(provisional, [built.box]);
    const topOfBody = 792 - geometry.margins.top;
    let cursor = topOfBody;
    let lastBaseline = Number.NaN;
    for (const paragraph of settlePage(built, topOfBody)) {
      if (paragraph.kind !== 'text') continue;
      cursor -= paragraph.spaceBeforePt;
      if (paragraph.lines.length > 0) lastBaseline = cursor - 0.8 * paragraph.leadingPt;
      cursor -= Math.max(1, paragraph.lines.length) * paragraph.leadingPt;
    }
    // Dropped, the quarter points added up to nearly seven; carried, the last line is where it was.
    expect(Math.abs(lastBaseline - (720 - 27 * 24.25))).toBeLessThan(0.35);
  });
});

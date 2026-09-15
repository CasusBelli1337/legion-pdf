import { describe, expect, it, vi } from 'vitest';
import type { OcrDetectResult, PageLayout } from '@shared/types';
import { exportPlan, planLines } from './export-plan';

function layout(page: number, extra: Partial<PageLayout> = {}): PageLayout {
  return {
    page,
    size: { width: 612, height: 792 },
    rotation: 0,
    fonts: { f1: { name: 'Times-Roman', family: 'serif', bold: false, italic: false } },
    runs: [
      {
        text: 'The parties stipulate to the following facts.',
        x: 96,
        y: 700,
        width: 250,
        sizePt: 12,
        fontKey: 'f1',
        role: 'body',
        eol: false,
      },
    ],
    images: [],
    rules: [],
    printedPageNumber: null,
    ...extra,
  };
}

/** A page with the 28-number column every California filing carries. */
function pleadingPage(page: number): PageLayout {
  const numbers = Array.from({ length: 28 }, (_unused, index) => ({
    text: String(index + 1),
    x: 48,
    y: 720 - index * 24,
    width: 8,
    sizePt: 12,
    fontKey: 'f1',
    role: 'line-number' as const,
    eol: false,
  }));
  const base = layout(page);
  return { ...base, runs: [...base.runs, ...numbers] };
}

function stampedPage(page: number): PageLayout {
  const base = layout(page);
  return {
    ...base,
    runs: [
      ...base.runs,
      {
        text: 'ASHFORD-000123',
        x: 430,
        y: 40,
        width: 90,
        sizePt: 9,
        fontKey: 'f1',
        role: 'stamp',
        eol: false,
      },
    ],
  };
}

const detected = (pagesNeedingOcr: number[], pageCount = 6): (() => Promise<OcrDetectResult>) => {
  const all = Array.from({ length: pageCount }, (_unused, index) => index + 1);
  return () =>
    Promise.resolve({
      pageCount,
      pagesNeedingOcr,
      pagesWithText: all.filter((page) => !pagesNeedingOcr.includes(page)),
    });
};

describe('planLines', () => {
  it('says nothing when nothing out of the ordinary will happen', () => {
    expect(
      planLines({ pageCount: 4, scannedPages: [], pleadingPages: [], stamped: false })
    ).toEqual([]);
  });

  it('leads with the pleading paper, then the scans, then the Bates numbers', () => {
    expect(
      planLines({ pageCount: 8, scannedPages: [3, 4], pleadingPages: [1], stamped: true })
    ).toEqual([
      'Pleading paper detected: line numbers and rules will be rebuilt so line 14 stays line 14.',
      '2 scanned pages will be recognized first. Choose below what happens to their pictures.',
      'Bates numbers will be left out; they differ on every page.',
    ]);
  });

  it('counts one scanned page in the singular', () => {
    const lines = planLines({ pageCount: 2, scannedPages: [2], pleadingPages: [], stamped: false });
    expect(lines).toEqual([
      '1 scanned page will be recognized first. Choose below what happens to its picture.',
    ]);
  });
});

describe('exportPlan', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('answers an empty plan for a format that is not Word, and reads nothing', async () => {
    const requestLayout = vi.fn(() => Promise.resolve(null));
    const detect = vi.fn(detected([1]));
    const plan = await exportPlan({
      format: 'png',
      pages: [1, 2],
      bytes,
      requestLayout,
      detect,
    });
    expect(plan).toEqual({
      format: 'png',
      pageCount: 2,
      scannedPages: [],
      pleadingPages: [],
      lines: [],
    });
    expect(detect).not.toHaveBeenCalled();
    expect(requestLayout).not.toHaveBeenCalled();
  });

  it('names the scanned pages inside the range and nothing outside it', async () => {
    const plan = await exportPlan({
      format: 'docx',
      pages: [1, 2, 3],
      bytes,
      requestLayout: (page) => Promise.resolve(layout(page)),
      detect: detected([2, 5]),
    });
    expect(plan.scannedPages).toEqual([2]);
    expect(plan.pageCount).toBe(3);
  });

  it('samples at most the first three pages that hold text', async () => {
    const requestLayout = vi.fn((page: number) => Promise.resolve(pleadingPage(page)));
    const plan = await exportPlan({
      format: 'docx',
      pages: [1, 2, 3, 4, 5, 6],
      bytes,
      requestLayout,
      detect: detected([1]),
    });
    // Page 1 is a scan, so the sample is 2, 3, 4 — never the whole document.
    expect(requestLayout.mock.calls.map((call) => call[0])).toEqual([2, 3, 4]);
    expect(plan.pleadingPages).toEqual([2, 3, 4]);
    expect(plan.lines[0]).toMatch(/Pleading paper detected/);
  });

  it('sees a Bates stamp on a sampled page', async () => {
    const plan = await exportPlan({
      format: 'docx',
      pages: [1],
      bytes,
      requestLayout: (page) => Promise.resolve(stampedPage(page)),
      detect: detected([], 1),
    });
    expect(plan.lines).toEqual(['Bates numbers will be left out; they differ on every page.']);
  });

  it('keeps the rest of the plan when one page will not answer', async () => {
    const plan = await exportPlan({
      format: 'docx',
      pages: [1, 2],
      bytes,
      requestLayout: (page) =>
        page === 1 ? Promise.reject(new Error('page died')) : Promise.resolve(pleadingPage(page)),
      detect: detected([], 2),
    });
    expect(plan.pleadingPages).toEqual([2]);
  });

  it('still answers when the document cannot be checked for scans', async () => {
    const plan = await exportPlan({
      format: 'docx',
      pages: [1],
      bytes,
      requestLayout: (page) => Promise.resolve(layout(page)),
      detect: () => Promise.reject(new Error('unreadable content stream')),
    });
    expect(plan.scannedPages).toEqual([]);
    expect(plan.lines).toEqual([]);
  });
});

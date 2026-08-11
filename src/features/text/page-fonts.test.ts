/**
 * Picking the run of text a drawn box is asking about, from the shape pdfjs
 * hands over.
 */

import { describe, expect, it } from 'vitest';
import { boxDistance, nearestRun, runsFromItems, type PageTextItem } from './page-fonts';

function item(partial: Partial<PageTextItem> & { fontName: string; str: string }): PageTextItem {
  return {
    transform: [12, 0, 0, 12, 72, 700],
    width: 120,
    height: 12,
    ...partial,
  };
}

describe('reading pdfjs text items into runs', () => {
  it('keeps the face, the size, and a box in PDF user space', () => {
    const runs = runsFromItems([item({ fontName: 'g_d0_f1', str: 'Deposition of' })]);
    expect(runs).toEqual([
      { fontKey: 'g_d0_f1', sizePt: 12, box: { x: 72, y: 700, width: 120, height: 12 } },
    ]);
  });

  it('drops whitespace-only runs, which carry no font worth copying', () => {
    const runs = runsFromItems([
      item({ fontName: 'g_d0_f1', str: '   ' }),
      item({ fontName: 'g_d0_f2', str: 'Exhibit A' }),
    ]);
    expect(runs.map((run) => run.fontKey)).toEqual(['g_d0_f2']);
  });

  it('follows the run direction on sideways text', () => {
    const runs = runsFromItems([
      item({ fontName: 'g_d0_f1', str: 'Sideways', transform: [0, 12, -12, 0, 72, 700] }),
    ]);
    expect(runs[0]?.box.height).toBeCloseTo(120, 6);
    expect(runs[0]?.box.width).toBeCloseTo(1, 6);
  });
});

describe('distance from a box to a rectangle', () => {
  it('is zero when they overlap', () => {
    const box = { x: 72, y: 700, width: 120, height: 12 };
    expect(boxDistance(box, { x: 80, y: 702, width: 20, height: 5 })).toBe(0);
  });

  it('measures the gap, not the centres', () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxDistance(box, { x: 13, y: 0, width: 10, height: 10 })).toBeCloseTo(3, 6);
  });
});

describe('the run a drawn box means', () => {
  const runs = runsFromItems([
    item({ fontName: 'heading', str: 'IN THE SUPERIOR COURT', transform: [18, 0, 0, 18, 72, 740] }),
    item({ fontName: 'body', str: 'Plaintiff alleges', transform: [12, 0, 0, 12, 72, 600] }),
  ]);

  it('picks the line the box was drawn over', () => {
    expect(nearestRun(runs, { x: 80, y: 598, width: 100, height: 16 })?.fontKey).toBe('body');
  });

  it('picks the nearest line when the box sits in white space', () => {
    expect(nearestRun(runs, { x: 80, y: 560, width: 100, height: 16 })?.fontKey).toBe('body');
    expect(nearestRun(runs, { x: 80, y: 770, width: 100, height: 16 })?.fontKey).toBe('heading');
  });

  it('finds nothing on a page with no text', () => {
    expect(nearestRun([], { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });
});

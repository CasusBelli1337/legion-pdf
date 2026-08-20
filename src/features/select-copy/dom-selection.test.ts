import { describe, expect, it } from 'vitest';
import { isSelectedRuns, normalizeRuns, pagesOfRuns, asSelection } from './dom-selection';

describe('selection runs', () => {
  it('puts the runs in reading order however the drag was made', () => {
    const runs = normalizeRuns([
      { page: 6, itemIndex: 2, from: 0, to: 4 },
      { page: 5, itemIndex: 9, from: 0, to: 3 },
      { page: 5, itemIndex: 1, from: 2, to: 8 },
    ]);

    expect(runs.map((run) => [run.page, run.itemIndex])).toEqual([
      [5, 1],
      [5, 9],
      [6, 2],
    ]);
  });

  it('merges two ranges that touch the same run so its text is copied once', () => {
    expect(
      normalizeRuns([
        { page: 5, itemIndex: 1, from: 0, to: 6 },
        { page: 5, itemIndex: 1, from: 4, to: 11 },
      ])
    ).toEqual([{ page: 5, itemIndex: 1, from: 0, to: 11 }]);
  });

  it('keeps two genuinely separate slices of one run apart', () => {
    expect(
      normalizeRuns([
        { page: 5, itemIndex: 1, from: 0, to: 4 },
        { page: 5, itemIndex: 1, from: 9, to: 12 },
      ])
    ).toHaveLength(2);
  });

  it('drops the zero-width runs a range picks up at its edges', () => {
    expect(
      normalizeRuns([
        { page: 5, itemIndex: 1, from: 3, to: 3 },
        { page: 5, itemIndex: 2, from: 0, to: 5 },
      ])
    ).toEqual([{ page: 5, itemIndex: 2, from: 0, to: 5 }]);
  });

  it('lists the pages a selection crosses', () => {
    expect(
      pagesOfRuns([
        { page: 6, itemIndex: 0, from: 0, to: 1 },
        { page: 5, itemIndex: 0, from: 0, to: 1 },
        { page: 6, itemIndex: 1, from: 0, to: 1 },
      ])
    ).toEqual([5, 6]);
  });

  it('recognises pre-extracted runs so the engine can be driven without a DOM', () => {
    expect(isSelectedRuns([{ page: 1, itemIndex: 0, from: 0, to: 2 }])).toBe(true);
    expect(isSelectedRuns([])).toBe(true);
    expect(isSelectedRuns([{ page: '1', itemIndex: 0 }])).toBe(false);
    expect(isSelectedRuns(null)).toBe(false);
    expect(isSelectedRuns({ getRangeAt: () => undefined })).toBe(false);
  });

  it('recognises a DOM selection by the one method it needs', () => {
    expect(asSelection({ getRangeAt: () => undefined })).not.toBeNull();
    expect(asSelection(null)).toBeNull();
    expect(asSelection([{ page: 1, itemIndex: 0, from: 0, to: 2 }])).toBeNull();
  });
});

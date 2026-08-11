import { describe, expect, it } from 'vitest';
import type { TextMatch } from '@shared/types';
import {
  boundingBox,
  hitTest,
  isDrawable,
  marksFromMatches,
  mergeQuadsIntoLines,
  moveRect,
  padRect,
  QUAD_PADDING_PT,
  rectFromCorners,
  resizeRect,
} from './mark-geometry';

describe('rectFromCorners', () => {
  it('builds a rectangle from a drag down and to the right', () => {
    expect(rectFromCorners({ x: 10, y: 100 }, { x: 60, y: 80 })).toEqual({
      x: 10,
      y: 80,
      width: 50,
      height: 20,
    });
  });

  it('builds the same rectangle from a drag the other way', () => {
    expect(rectFromCorners({ x: 60, y: 80 }, { x: 10, y: 100 })).toEqual(
      rectFromCorners({ x: 10, y: 100 }, { x: 60, y: 80 })
    );
  });

  it('gives a click no area at all', () => {
    expect(rectFromCorners({ x: 5, y: 5 }, { x: 5, y: 5 })).toMatchObject({ width: 0, height: 0 });
  });
});

describe('padRect', () => {
  it('grows a search quad on every side, because quad widths run short', () => {
    expect(padRect({ x: 100, y: 200, width: 50, height: 10 })).toEqual({
      x: 100 - QUAD_PADDING_PT,
      y: 200 - QUAD_PADDING_PT,
      width: 50 + QUAD_PADDING_PT * 2,
      height: 10 + QUAD_PADDING_PT * 2,
    });
  });

  it('never produces a negative dimension', () => {
    expect(padRect({ x: 0, y: 0, width: 1, height: 1 }, -5)).toMatchObject({
      width: 0,
      height: 0,
    });
  });
});

describe('isDrawable', () => {
  it('accepts a real box', () => {
    expect(isDrawable({ x: 0, y: 0, width: 20, height: 8 })).toBe(true);
  });

  it('rejects a stray click that dragged a pixel', () => {
    expect(isDrawable({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
  });

  it('rejects a box with no height', () => {
    expect(isDrawable({ x: 0, y: 0, width: 50, height: 0 })).toBe(false);
  });
});

describe('moveRect', () => {
  it('slides a mark without changing its size', () => {
    expect(moveRect({ x: 10, y: 10, width: 30, height: 5 }, -4, 12)).toEqual({
      x: 6,
      y: 22,
      width: 30,
      height: 5,
    });
  });
});

describe('resizeRect', () => {
  const rect = { x: 100, y: 100, width: 40, height: 20 };

  it('drags the south-east corner and pins the north-west one', () => {
    expect(resizeRect(rect, 'se', { x: 180, y: 60 })).toEqual({
      x: 100,
      y: 60,
      width: 80,
      height: 60,
    });
  });

  it('drags the north-west corner and pins the south-east one', () => {
    expect(resizeRect(rect, 'nw', { x: 60, y: 200 })).toEqual({
      x: 60,
      y: 100,
      width: 80,
      height: 100,
    });
  });

  it('survives a drag straight past the opposite corner', () => {
    expect(resizeRect(rect, 'se', { x: 50, y: 200 })).toEqual({
      x: 50,
      y: 120,
      width: 50,
      height: 80,
    });
  });
});

describe('hitTest', () => {
  const rect = { x: 10, y: 10, width: 20, height: 20 };

  it('finds a point inside the mark', () => {
    expect(hitTest(rect, { x: 15, y: 15 })).toBe(true);
  });

  it('misses a point outside it', () => {
    expect(hitTest(rect, { x: 35, y: 15 })).toBe(false);
  });

  it('accepts a near miss within the grab tolerance', () => {
    expect(hitTest(rect, { x: 32, y: 15 }, 3)).toBe(true);
  });
});

describe('boundingBox', () => {
  it('contains every rectangle it was given', () => {
    expect(
      boundingBox([
        { x: 10, y: 10, width: 10, height: 5 },
        { x: 30, y: 12, width: 10, height: 5 },
      ])
    ).toEqual({ x: 10, y: 10, width: 30, height: 7 });
  });
});

describe('mergeQuadsIntoLines', () => {
  it('merges quads that sit on the same line into one seamless rectangle', () => {
    expect(
      mergeQuadsIntoLines([
        { x: 72, y: 700, width: 20, height: 11 },
        { x: 96, y: 700, width: 30, height: 11 },
      ])
    ).toEqual([{ x: 72, y: 700, width: 54, height: 11 }]);
  });

  it('keeps the lines of a hit that wraps apart, top line first', () => {
    const lines = mergeQuadsIntoLines([
      { x: 72, y: 686, width: 40, height: 11 },
      { x: 400, y: 700, width: 90, height: 11 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.y).toBe(700);
  });

  it('leaves a single quad exactly as it was', () => {
    const quad = { x: 1, y: 2, width: 3, height: 4 };
    expect(mergeQuadsIntoLines([quad])).toEqual([quad]);
  });

  it('has nothing to merge when a hit reports no quads', () => {
    expect(mergeQuadsIntoLines([])).toEqual([]);
  });
});

describe('marksFromMatches', () => {
  const matches: TextMatch[] = [
    {
      page: 3,
      text: 'SSN 545-45-6789',
      index: 0,
      quads: [
        { x: 72, y: 700, width: 90, height: 11 },
        { x: 72, y: 686, width: 40, height: 11 },
      ],
    },
    {
      page: 5,
      text: 'SSN 545-45-6789',
      index: 1,
      quads: [{ x: 72, y: 400, width: 90, height: 11 }],
    },
  ];

  it('makes one padded mark per LINE of a hit, never one per quad', () => {
    const marks = marksFromMatches(matches);
    expect(marks).toHaveLength(3);
    expect(marks[0]?.rect).toEqual(
      padRect(matches[0]?.quads[0] ?? { x: 0, y: 0, width: 0, height: 0 })
    );
  });

  it('keeps the page of every hit', () => {
    expect(marksFromMatches(matches).map((mark) => mark.page)).toEqual([3, 3, 5]);
  });

  it('closes the seam between the quads of one hit on one line', () => {
    // pdfjs splits "SSN 545-45-6789" into three items with gaps between them.
    // A mark per quad leaves hairlines of untouched pixels in the black bar.
    const split: TextMatch = {
      page: 1,
      text: 'SSN 545-45-6789',
      index: 0,
      quads: [
        { x: 72, y: 700, width: 20, height: 11 },
        { x: 96, y: 700, width: 30, height: 11 },
        { x: 130, y: 700, width: 25, height: 11 },
      ],
    };
    const marks = marksFromMatches([split]);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.rect).toEqual(padRect({ x: 72, y: 700, width: 83, height: 11 }));
  });

  it('remembers the hit each mark came from, so verification has a string to prove', () => {
    expect(marksFromMatches(matches).every((mark) => mark.sourceMatch?.text.length === 15)).toBe(
      true
    );
  });

  it('gives every mark a stable, distinct id', () => {
    const ids = marksFromMatches(matches).map((mark) => mark.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(marksFromMatches(matches).map((mark) => mark.id)).toEqual(ids);
  });
});

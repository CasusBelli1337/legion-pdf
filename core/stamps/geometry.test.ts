import { describe, expect, it } from 'vitest';
import {
  bandAnchor,
  centredAnchor,
  cornerAnchor,
  frameOf,
  normalizeRotation,
  stampAnchor,
  toUserSpace,
  toVisualSpace,
  uprightDegrees,
} from './geometry';

const LETTER = { width: 612, height: 792 };

describe('normalizeRotation', () => {
  it('folds any angle onto a quarter turn', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(359)).toBe(0);
  });
});

describe('frameOf', () => {
  it('swaps width and height on a quarter turn', () => {
    expect(frameOf(LETTER, 0).visual).toEqual(LETTER);
    expect(frameOf(LETTER, 180).visual).toEqual(LETTER);
    expect(frameOf(LETTER, 90).visual).toEqual({ width: 792, height: 612 });
    expect(frameOf(LETTER, 270).visual).toEqual({ width: 792, height: 612 });
  });
});

describe('toUserSpace', () => {
  it('is the identity on an unrotated page', () => {
    expect(toUserSpace(frameOf(LETTER, 0), { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it('puts the visual bottom-left at the right stored corner for every rotation', () => {
    const corners = [0, 90, 180, 270].map((angle) =>
      toUserSpace(frameOf(LETTER, angle), { x: 0, y: 0 })
    );
    expect(corners).toEqual([
      { x: 0, y: 0 },
      { x: 612, y: 0 },
      { x: 612, y: 792 },
      { x: 0, y: 792 },
    ]);
  });

  it('round-trips through toVisualSpace at every rotation', () => {
    for (const angle of [0, 90, 180, 270]) {
      const frame = frameOf(LETTER, angle);
      const visual = { x: 123, y: 456 };
      expect(toVisualSpace(frame, toUserSpace(frame, visual))).toEqual(visual);
    }
  });

  it('carries a media box that does not start at the origin', () => {
    const frame = frameOf(LETTER, 0, { x: 10, y: 25 });
    expect(toUserSpace(frame, { x: 0, y: 0 })).toEqual({ x: 10, y: 25 });
    expect(toVisualSpace(frame, { x: 10, y: 25 })).toEqual({ x: 0, y: 0 });
  });
});

describe('uprightDegrees', () => {
  it('turns ink by the page rotation so the reader sees it level', () => {
    expect([0, 90, 180, 270].map((angle) => uprightDegrees(frameOf(LETTER, angle)))).toEqual([
      0, 90, 180, 270,
    ]);
  });
});

describe('cornerAnchor', () => {
  const box = { width: 100, height: 10 };

  it('insets every corner by the margin', () => {
    expect(cornerAnchor('bottom-left', LETTER, box, 36)).toEqual({ x: 36, y: 36 });
    expect(cornerAnchor('bottom-right', LETTER, box, 36)).toEqual({ x: 476, y: 36 });
    expect(cornerAnchor('top-left', LETTER, box, 36)).toEqual({ x: 36, y: 746 });
    expect(cornerAnchor('top-right', LETTER, box, 36)).toEqual({ x: 476, y: 746 });
  });

  it('measures a rotated page by what the reader sees', () => {
    const visual = frameOf(LETTER, 90).visual;
    expect(cornerAnchor('bottom-right', visual, box, 36)).toEqual({ x: 656, y: 36 });
  });
});

describe('stampAnchor', () => {
  const box = { width: 100, height: 10 };
  const corners = ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const;

  it('leaves every corner exactly where cornerAnchor puts it', () => {
    for (const corner of corners) {
      expect(stampAnchor(corner, LETTER, box, 36)).toEqual(cornerAnchor(corner, LETTER, box, 36));
    }
  });

  it('centres bottom-center on the bottom edge at the corner margin', () => {
    expect(stampAnchor('bottom-center', LETTER, box, 36)).toEqual({ x: 256, y: 36 });
  });

  it('sits midway between the two bottom corners', () => {
    const left = cornerAnchor('bottom-left', LETTER, box, 36);
    const right = cornerAnchor('bottom-right', LETTER, box, 36);
    const centre = stampAnchor('bottom-center', LETTER, box, 36);
    expect(centre.x).toBeCloseTo((left.x + right.x) / 2, 6);
    expect(centre.y).toBe(left.y);
  });

  it('centres by what the reader sees on a rotated page', () => {
    const visual = frameOf(LETTER, 90).visual;
    expect(stampAnchor('bottom-center', visual, box, 36)).toEqual({ x: 346, y: 36 });
  });
});

describe('bandAnchor', () => {
  const box = { width: 100, height: 10 };

  it('aligns inside the margins of a header and a footer', () => {
    expect(bandAnchor('footer', 'left', LETTER, box, 36)).toEqual({ x: 36, y: 36 });
    expect(bandAnchor('footer', 'right', LETTER, box, 36)).toEqual({ x: 476, y: 36 });
    expect(bandAnchor('header', 'center', LETTER, box, 36)).toEqual({ x: 256, y: 746 });
  });
});

describe('centredAnchor', () => {
  it('centres a level box on the page', () => {
    expect(centredAnchor(LETTER, { width: 200, height: 40 }, 0)).toEqual({ x: 206, y: 376 });
  });

  it('keeps a spun box centred on the page centre', () => {
    const box = { width: 200, height: 40 };
    const anchor = centredAnchor(LETTER, box, 45);
    const radians = Math.PI / 4;
    const centre = {
      x: anchor.x + (box.width / 2) * Math.cos(radians) - (box.height / 2) * Math.sin(radians),
      y: anchor.y + (box.width / 2) * Math.sin(radians) + (box.height / 2) * Math.cos(radians),
    };
    expect(centre.x).toBeCloseTo(306, 6);
    expect(centre.y).toBeCloseTo(396, 6);
  });
});

import { describe, expect, it } from 'vitest';
import type { EsignFieldKind } from '@shared/types';
import { FIELD_SIZES, MAX_FIELD_SIZE, MIN_FIELD_SIZE, clampRect, rectAt } from './field-geometry';

const KINDS = Object.keys(FIELD_SIZES) as EsignFieldKind[];

describe('rectAt', () => {
  it('centres every kind’s default box on the click point', () => {
    for (const kind of KINDS) {
      const rect = rectAt(kind, { x: 300, y: 400 });
      const size = FIELD_SIZES[kind];
      expect(rect.width).toBe(size.width);
      expect(rect.height).toBe(size.height);
      expect(rect.x + rect.width / 2).toBe(300);
      expect(rect.y + rect.height / 2).toBe(400);
    }
  });

  it('gives a signature its house default box', () => {
    expect(rectAt('signature', { x: 100, y: 100 })).toEqual({
      x: 10,
      y: 80,
      width: 180,
      height: 40,
    });
  });
});

describe('clampRect', () => {
  it('refuses a box too small to click', () => {
    const clamped = clampRect({ x: 5, y: 5, width: 1, height: 1 });
    expect(clamped.width).toBe(MIN_FIELD_SIZE.width);
    expect(clamped.height).toBe(MIN_FIELD_SIZE.height);
  });

  it('refuses a box that would swallow the page', () => {
    const clamped = clampRect({ x: 5, y: 5, width: 9000, height: 9000 });
    expect(clamped.width).toBe(MAX_FIELD_SIZE.width);
    expect(clamped.height).toBe(MAX_FIELD_SIZE.height);
  });

  it('leaves a sensible box exactly where it was', () => {
    const rect = { x: 72, y: 144, width: 180, height: 40 };
    expect(clampRect(rect)).toEqual(rect);
  });

  it('never touches the anchor, only the size', () => {
    const clamped = clampRect({ x: -33, y: 900, width: 1, height: 9000 });
    expect(clamped.x).toBe(-33);
    expect(clamped.y).toBe(900);
  });
});

import { describe, expect, it } from 'vitest';
import type { LayoutRule } from '@shared/types';
import { placedScanRules, withoutEchoes } from './scan-rule-placement';

const VIEW = [0, 0, 612, 792];
/** A scan drawn over the whole page, upright. */
const SCAN = { rect: { x: 0, y: 0, width: 612, height: 792 }, widthPx: 2550, heightPx: 3300 };
const UPRIGHT = [612, 0, 0, 792, 0, 0];

function rule(x: number, y: number, width: number, height: number): LayoutRule {
  return { rect: { x, y, width, height } };
}

describe('placedScanRules', () => {
  it('sets a rule found in the pixels on the page, measured from its bottom edge', () => {
    const [placed] = placedScanRules(
      [{ x: 530, y: 100, width: 5, height: 3100 }],
      SCAN,
      UPRIGHT,
      VIEW
    );
    expect(placed?.rect.x).toBeCloseTo(127.2, 5);
    expect(placed?.rect.width).toBeCloseTo(1.2, 5);
    expect(placed?.rect.y).toBeCloseTo(24, 5);
    expect(placed?.rect.height).toBeCloseTo(744, 5);
  });

  it('follows a scan drawn inside a margin', () => {
    const inset = {
      rect: { x: 36, y: 36, width: 540, height: 720 },
      widthPx: 1080,
      heightPx: 1440,
    };
    const ctm = [540, 0, 0, 720, 36, 36];
    const [placed] = placedScanRules([{ x: 0, y: 0, width: 2, height: 1440 }], inset, ctm, VIEW);
    expect(placed?.rect).toEqual({ x: 36, y: 36, width: 1, height: 720 });
  });

  it('keeps the lines of a picture that is not the page to the picture', () => {
    const photo = {
      rect: { x: 100, y: 300, width: 300, height: 200 },
      widthPx: 1500,
      heightPx: 1000,
    };
    const found = [{ x: 10, y: 10, width: 2, height: 900 }];
    expect(placedScanRules(found, photo, [300, 0, 0, 200, 100, 300], VIEW)).toEqual([]);
  });

  it('does not guess at a scan drawn turned or mirrored', () => {
    const found = [{ x: 10, y: 10, width: 2, height: 900 }];
    expect(placedScanRules(found, SCAN, [0, 792, -612, 0, 612, 0], VIEW)).toEqual([]);
    expect(placedScanRules(found, SCAN, [612, 0, 0, -792, 0, 792], VIEW)).toEqual([]);
  });
});

describe('withoutEchoes', () => {
  const inked = [rule(126.8, 94, 0.7, 660), rule(128.8, 94, 0.7, 660), rule(131, 286, 200, 0.5)];

  it('drops a drawn rule that only traces one in the scan', () => {
    const traced = [rule(128.2, 93, 0, 662), rule(129, 286.3, 203, 0)];
    expect(withoutEchoes(traced, inked)).toEqual([]);
  });

  it('keeps a drawn rule the scan does not show, or shows somewhere else', () => {
    const own = [rule(331.9, 128, 0, 329), rule(131, 400, 200, 0), rule(128.2, 760, 0, 20)];
    expect(withoutEchoes(own, inked)).toEqual(own);
  });
});

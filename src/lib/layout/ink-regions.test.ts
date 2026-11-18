import { describe, expect, it } from 'vitest';
import type { LayoutTextRun } from '@shared/types';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike } from './extract-page-layout';
import { inkReadings, inkRegion, outsideInk } from './ink-regions';
import { pixelBoxOf } from './region-raster';

const typed = (text: string, y: number, hidden = false): LayoutTextRun => ({
  text,
  x: 92,
  y,
  width: text.length * 6,
  sizePt: 12,
  fontKey: 'f1',
  colorHex: '#000000',
  role: 'body',
  eol: true,
  ...(hidden ? { hidden: true } : {}),
});

const DECLARATION = [
  typed('I declare under penalty of perjury that the foregoing is true.', 285),
  typed('Executed on June ____, 2025.', 261),
  typed('DANA R. WHITLOCK', 206),
];
const READING: LayoutTextRun = { ...typed('dalwhrl', 225, true), x: 320, width: 176, sizePt: 40 };

describe('inkReadings', () => {
  it('finds the invisible reading of a signature on a typed page', () => {
    expect(inkReadings([...DECLARATION, READING], [])).toEqual([3]);
  });

  it('leaves a scan alone: its invisible text is the page', () => {
    const scan = DECLARATION.map((run) => ({ ...run, hidden: true }));
    expect(inkReadings(scan, [])).toEqual([]);
  });

  it('leaves recognised text over a picture alone (a scanned letterhead on a typed page)', () => {
    const picture = { rect: { x: 300, y: 200, width: 220, height: 80 } };
    const images = [{ ...picture, png: new Uint8Array(0), widthPx: 1, heightPx: 1 }];
    expect(inkReadings([...DECLARATION, READING], images)).toEqual([]);
  });
});

describe('inkRegion', () => {
  it('covers the reading with room for the strokes that overshoot it', () => {
    expect(inkRegion(READING)).toEqual({ x: 308, y: 213, width: 200, height: 64 });
  });

  it('keeps at least four points around a small mark, so a filled-in date reaches its line', () => {
    const date: LayoutTextRun = { ...typed('13', 261.7, true), x: 200, width: 8, sizePt: 8 };
    const region = inkRegion(date);
    expect(region.y).toBeCloseTo(257.7);
    expect(region.height).toBe(16);
  });

  it('tells a pen stroke read as a rule from the page’s own rules', () => {
    const regions = [inkRegion(READING)];
    expect(outsideInk({ rect: { x: 330, y: 220, width: 1, height: 7 } }, regions)).toBe(false);
    expect(outsideInk({ rect: { x: 82, y: 25, width: 0.7, height: 744 } }, regions)).toBe(true);
  });
});

describe('pixelBoxOf', () => {
  it('turns a patch into whole canvas pixels, top-left origin', () => {
    const viewport = {
      // Letter paper at 200 dpi: y flips, both axes scale by 200/72.
      convertToViewportPoint: (x: number, y: number) => [(x * 200) / 72, ((792 - y) * 200) / 72],
    };
    expect(pixelBoxOf({ x: 308, y: 213, width: 200, height: 64 }, viewport)).toEqual({
      left: 855,
      top: 1430,
      widthPx: 557,
      heightPx: 179,
    });
  });
});

describe('extractPageLayout on a typed page signed in ink', () => {
  const OPS = { showText: 4, setTextRenderingMode: 5 };
  const glyphs = (text: string) => [...text].map((unicode) => ({ unicode }));
  const item = (str: string, x: number, y: number, size: number, width: number) => ({
    str,
    transform: [size, 0, 0, size, x, y],
    width,
    height: size,
    fontName: 'f1',
  });
  const store = { has: () => true, get: () => ({ name: 'Century' }) };
  const signed: PageLike = {
    view: [0, 0, 612, 792],
    rotate: 0,
    getTextContent: () =>
      Promise.resolve({
        items: [
          item('I declare under penalty of perjury that the foregoing is true.', 92, 285, 12, 330),
          item('DANA R. WHITLOCK', 308, 206, 12, 96),
          item('dalwhrl', 320, 225, 40, 176),
        ],
        styles: {},
      }),
    getOperatorList: () =>
      Promise.resolve({
        fnArray: [OPS.showText, OPS.showText, OPS.setTextRenderingMode, OPS.showText],
        argsArray: [
          [glyphs('I declare under penalty of perjury that the foregoing is true.')],
          [glyphs('DANA R. WHITLOCK')],
          [3],
          [glyphs('dalwhrl')],
        ],
      }),
    commonObjs: store,
    objs: store,
  };
  const input = {
    page: 3,
    ops: OPS,
    roles: new Map(),
    printedPageNumber: null,
    rasterize: () => Promise.resolve(null),
  };

  it('drops the reading and carries the patch as a picture where the ink was', async () => {
    const png = new Uint8Array([1, 2, 3]);
    const layout = await extractPageLayout(signed, {
      ...input,
      drawRegion: () => Promise.resolve({ png, widthPx: 557, heightPx: 179 }),
    });
    expect(layout.runs.map((run) => run.text)).not.toContain('dalwhrl');
    expect(layout.images).toEqual([
      { rect: { x: 308, y: 213, width: 200, height: 64 }, png, widthPx: 557, heightPx: 179 },
    ]);
    expect(layout.inkLeftOut).toBeUndefined();
  });

  it('says so when the patch cannot be drawn, and still never types the guess', async () => {
    const layout = await extractPageLayout(signed, input);
    expect(layout.runs.map((run) => run.text)).not.toContain('dalwhrl');
    expect(layout.images).toEqual([]);
    expect(layout.inkLeftOut).toBe(1);
  });
});

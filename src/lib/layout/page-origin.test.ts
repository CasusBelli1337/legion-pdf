import { describe, expect, it } from 'vitest';
import { extractPageLayout } from './extract-page-layout';
import type { PageLike } from './extract-page-layout';
import { atOrigin, fromOrigin, originOf, transformFromOrigin } from './page-origin';

const OPS = { save: 1, restore: 2, transform: 3, showText: 4, paintImageXObject: 5 };

/** A landscape envelope cropped out of a portrait sheet: the box starts 180 pt up. */
function croppedPage(): PageLike {
  const store = { has: () => true, get: () => ({ width: 10, height: 10 }) };
  return {
    view: [0, 180, 792, 792],
    rotate: 0,
    getTextContent: () =>
      Promise.resolve({
        items: [{ str: 'RETURN SERVICE', transform: [8, 0, 0, 8, 108, 633], width: 70, height: 8 }],
        styles: {},
      }),
    getOperatorList: () =>
      Promise.resolve({
        fnArray: [OPS.transform, OPS.paintImageXObject],
        argsArray: [
          [792, 0, 0, 612, 0, 180],
          ['img_p0_1', 10, 10],
        ],
      }),
    commonObjs: store,
    objs: store,
  };
}

describe('page origin', () => {
  it('reads the lower-left corner of a view, and zero when there is none', () => {
    expect(originOf([0, 180, 792, 792])).toEqual({ x: 0, y: 180 });
    expect(originOf(undefined)).toEqual({ x: 0, y: 0 });
    expect(atOrigin(originOf([0, 0, 612, 792]))).toBe(true);
  });

  it('takes the origin off a text item, leaving its size and slant alone', () => {
    expect(transformFromOrigin([8, 0, 0, 8, 108, 633], { x: 10, y: 180 })).toEqual([
      8, 0, 0, 8, 98, 453,
    ]);
  });

  it('hands back the very same marks for a page that starts at zero', () => {
    const marks = { runs: [], images: [], rules: [] };
    expect(fromOrigin(marks, { x: 0, y: 0 })).toBe(marks);
  });
});

describe('extractPageLayout on a page whose box does not start at zero', () => {
  it('measures words and pictures from the page corner, not from the box origin', async () => {
    const layout = await extractPageLayout(croppedPage(), {
      page: 2,
      ops: OPS,
      roles: new Map(),
      printedPageNumber: null,
      rasterize: () => Promise.resolve({ png: new Uint8Array([1]), widthPx: 10, heightPx: 10 }),
    });
    expect(layout.size).toEqual({ width: 792, height: 612 });
    // 633 in the file's coordinates is 453 up a page that is 612 tall — not above its top edge.
    expect(layout.runs.map((run) => [run.x, run.y])).toEqual([[108, 453]]);
    expect(layout.images.map((image) => image.rect)).toEqual([
      { x: 0, y: 0, width: 792, height: 612 },
    ]);
  });
});

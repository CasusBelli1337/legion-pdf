import { describe, expect, it } from 'vitest';
import type { WhiteoutOptions } from '@shared/types';
import { makeTestPdf } from '../ops/test-fixtures';
import { frameOf, toUserSpace } from './geometry';
import { addTextBox } from './text-box';
import { applyWhiteout } from './whiteout';
import { marksOnPage, place, textMarksOnPage } from './stamp-testkit';

const PAGE = { width: 612, height: 792 };

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    ...PAGE,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<WhiteoutOptions> = {}): WhiteoutOptions {
  return {
    page: 1,
    rect: { x: 100, y: 200, width: 220, height: 40 },
    ...overrides,
  };
}

/** The rectangle marks a page draws, as bottom-left plus size in user space. */
async function coversOnPage(bytes: Uint8Array, page: number) {
  const rects = (await marksOnPage(bytes, page)).filter((mark) => mark.kind === 'rect');
  return rects.map((rect) => {
    const origin = place(rect.matrix, { x: 0, y: 0 });
    const opposite = place(rect.matrix, { x: rect.width, y: rect.height });
    return {
      x: Math.min(origin.x, opposite.x),
      y: Math.min(origin.y, opposite.y),
      width: Math.abs(opposite.x - origin.x),
      height: Math.abs(opposite.y - origin.y),
    };
  });
}

describe('applyWhiteout', () => {
  it('paints a rectangle over exactly the dragged area', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await applyWhiteout(bytes, options());

    expect(result.pagesOut).toBe(2);
    const covers = await coversOnPage(result.bytes, 1);
    expect(covers).toHaveLength(1);
    expect(covers[0]?.x).toBeCloseTo(100, 6);
    expect(covers[0]?.y).toBeCloseTo(200, 6);
    expect(covers[0]?.width).toBeCloseTo(220, 6);
    expect(covers[0]?.height).toBeCloseTo(40, 6);
    expect(await coversOnPage(result.bytes, 2)).toHaveLength(0);
  });

  it('covers the same area however the box was dragged out', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const backwards = await applyWhiteout(
      bytes,
      options({ rect: { x: 320, y: 240, width: -220, height: -40 } })
    );
    const covers = await coversOnPage(backwards.bytes, 1);
    expect(covers[0]?.x).toBeCloseTo(100, 6);
    expect(covers[0]?.y).toBeCloseTo(200, 6);
    expect(covers[0]?.width).toBeCloseTo(220, 6);
    expect(covers[0]?.height).toBeCloseTo(40, 6);
  });

  it('covers the same area on a rotated page', async () => {
    for (const rotation of [90, 180, 270]) {
      const frame = frameOf(PAGE, rotation);
      const first = toUserSpace(frame, { x: 40, y: 50 });
      const second = toUserSpace(frame, { x: 240, y: 90 });
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const result = await applyWhiteout(
        bytes,
        options({
          rect: {
            x: Math.min(first.x, second.x),
            y: Math.min(first.y, second.y),
            width: Math.abs(second.x - first.x),
            height: Math.abs(second.y - first.y),
          },
        })
      );
      const covers = await coversOnPage(result.bytes, 1);
      expect(covers[0]?.width).toBeCloseTo(Math.abs(second.x - first.x), 6);
      expect(covers[0]?.height).toBeCloseTo(Math.abs(second.y - first.y), 6);
    }
  });

  it('takes a sampled background colour instead of white', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await applyWhiteout(bytes, options({ color: '#EFEFEF' }));
    expect(await coversOnPage(result.bytes, 1)).toHaveLength(1);
    await expect(applyWhiteout(bytes, options({ color: 'eggshell' }))).rejects.toThrow(/#RRGGBB/);
  });

  it('supports cover-then-retype as two verified steps', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const covered = await applyWhiteout(bytes, options());
    const retyped = await addTextBox(covered.bytes, {
      page: 1,
      at: { x: 105, y: 210 },
      text: 'Rothrock Legal',
      fontSize: 12,
      color: '#000000',
    });

    expect(retyped.pagesOut).toBe(1);
    expect(await coversOnPage(retyped.bytes, 1)).toHaveLength(1);
    expect((await textMarksOnPage(retyped.bytes, 1)).map((m) => m.text)).toContain(
      'Rothrock Legal'
    );
  });

  describe('refusals', () => {
    it('refuses a box with no area', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(
        applyWhiteout(bytes, options({ rect: { x: 10, y: 10, width: 0, height: 40 } }))
      ).rejects.toThrow(/covers nothing/);
    });

    it('refuses a page the document does not have', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(applyWhiteout(bytes, options({ page: 5 }))).rejects.toThrow(/pages 1 through 2/);
    });
  });
});

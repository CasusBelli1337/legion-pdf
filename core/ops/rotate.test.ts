import { describe, expect, it } from 'vitest';
import { rotatePages } from './rotate';
import { labelledPages, makeTestPdf, pageRotations } from './test-fixtures';

async function threePages(rotation?: number): Promise<Uint8Array> {
  return makeTestPdf({
    pages: labelledPages(3, 'R', 900).map((page) => ({ ...page, rotation })),
  });
}

describe('rotatePages', () => {
  it('turns only the selected pages clockwise', async () => {
    const result = await rotatePages(await threePages(), { pages: [2], degrees: 90 });

    expect(result.pagesIn).toBe(3);
    expect(result.pagesOut).toBe(3);
    expect(await pageRotations(result.bytes)).toEqual([0, 90, 0]);
  });

  it('adds to the rotation a page already had instead of replacing it', async () => {
    const once = await rotatePages(await threePages(90), { pages: [1], degrees: 90 });
    expect(await pageRotations(once.bytes)).toEqual([180, 90, 90]);
  });

  it('turns counter-clockwise with 270 and wraps back to upright', async () => {
    const result = await rotatePages(await threePages(90), { pages: [1, 2, 3], degrees: 270 });
    expect(await pageRotations(result.bytes)).toEqual([0, 0, 0]);
  });

  it('handles a half turn', async () => {
    const result = await rotatePages(await threePages(270), { pages: [3], degrees: 180 });
    expect(await pageRotations(result.bytes)).toEqual([270, 270, 90]);
  });

  it('refuses an angle that is not a quarter turn', async () => {
    await expect(
      rotatePages(await threePages(), { pages: [1], degrees: 45 as 90 })
    ).rejects.toThrow('Pages turn in quarter turns — 45° is not one of them.');
  });

  it('refuses an empty selection and a page that does not exist', async () => {
    await expect(rotatePages(await threePages(), { pages: [], degrees: 90 })).rejects.toThrow(
      /selects no pages/
    );
    await expect(rotatePages(await threePages(), { pages: [7], degrees: 90 })).rejects.toThrow(
      'The pages to rotate includes page 7, but this document has pages 1 through 3.'
    );
  });

  it('reports progress for every page it turns', async () => {
    const seen: [number, number][] = [];
    await rotatePages(await threePages(), { pages: [1, 3], degrees: 90 }, (current, total) =>
      seen.push([current, total])
    );
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

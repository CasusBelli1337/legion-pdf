import { describe, expect, it } from 'vitest';
import { RangeCollapseError } from '@shared/types';
import { splitByRanges } from './split';
import { labelledPages, makeTestPdf, pageWidths } from './test-fixtures';

async function sixPages(): Promise<Uint8Array> {
  return makeTestPdf({ pages: labelledPages(6, 'P', 500) });
}

describe('splitByRanges', () => {
  it('splits "1-3, 4-6" into two parts of three pages each', async () => {
    const source = await sixPages();
    const result = await splitByRanges(source, ['1-3', '4-6']);

    expect(result.pagesIn).toBe(6);
    expect(result.pagesOut).toBe(6);
    expect(result.detail.partPageCounts).toEqual([3, 3]);
    expect(result.detail.parts).toHaveLength(2);
    expect(await pageWidths(result.detail.parts[0] ?? new Uint8Array())).toEqual([500, 501, 502]);
    expect(await pageWidths(result.detail.parts[1] ?? new Uint8Array())).toEqual([503, 504, 505]);
  });

  it('leaves the source document untouched', async () => {
    const source = await sixPages();
    const result = await splitByRanges(source, ['2']);

    expect(result.bytes).toBe(source);
    expect(await pageWidths(result.bytes)).toHaveLength(6);
  });

  it('handles a scattered spec and counts overlapping ranges honestly', async () => {
    const result = await splitByRanges(await sixPages(), ['1, 3, 5', '1-6']);

    expect(result.detail.partPageCounts).toEqual([3, 6]);
    expect(result.pagesOut).toBe(9);
    expect(await pageWidths(result.detail.parts[0] ?? new Uint8Array())).toEqual([500, 502, 504]);
  });

  it('throws RangeCollapseError when no ranges are given', async () => {
    await expect(splitByRanges(await sixPages(), [])).rejects.toThrow(RangeCollapseError);
  });

  it('throws RangeCollapseError when a range is only whitespace', async () => {
    await expect(splitByRanges(await sixPages(), ['1-2', '  '])).rejects.toThrow(
      RangeCollapseError
    );
  });

  it('refuses a range past the end of the document before writing anything', async () => {
    await expect(splitByRanges(await sixPages(), ['5-9'])).rejects.toThrow(
      '"5-9" asks for page 9, but this document ends at page 6.'
    );
  });

  it('reports progress once per range', async () => {
    const seen: [number, number][] = [];
    await splitByRanges(await sixPages(), ['1-2', '3-4', '5-6'], (current, total) =>
      seen.push([current, total])
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

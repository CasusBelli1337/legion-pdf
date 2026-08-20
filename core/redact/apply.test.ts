import { describe, expect, it, vi } from 'vitest';
import type { RedactApplyOptions, RedactionBox } from '@shared/types';
import { containsText, makeTestPdf, pageRotations, pageWidths } from '@core/ops/test-fixtures';
import { applyRedactions, PHASE_RASTERIZE, PHASE_VERIFY } from './apply';
import { fakePageRaster, pixelAt } from './raster.testkit';
import { NoRedactionMarksError, RedactionNotVerifiedError } from './types';
import type { PageRaster } from './types';

const SECRET = 'SSN 545-45-6789';
const SURVIVOR = 'MUST-SURVIVE-REDACTION';
const DPI = 72;

interface Page {
  width: number;
  height: number;
  rotation?: number;
}

/** Stands in for the renderer: rasters sized from the real page geometry. */
function rasterPort(pages: Page[]) {
  return (page: number): Promise<PageRaster> => {
    const spec = pages[page - 1];
    if (spec === undefined) throw new Error(`No fake raster for page ${page}.`);
    return Promise.resolve(
      fakePageRaster({
        crop: { x: 0, y: 0, width: spec.width, height: spec.height },
        rotation: spec.rotation ?? 0,
        dpi: DPI,
        band: true,
      })
    );
  };
}

function mark(page: number, id = `mark-${page}`, index = page): RedactionBox {
  return {
    id,
    page,
    rect: { x: 15, y: 190, width: 120, height: 30 },
    sourceMatch: { page, text: SECRET, index, quads: [] },
  };
}

function options(boxes: RedactionBox[], overrides: Partial<RedactApplyOptions> = {}) {
  return { boxes, dpi: DPI, reOcr: false, verifyStrings: [], ...overrides };
}

async function twoPages(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: [
      { label: SECRET, width: 200, height: 300 },
      { label: SURVIVOR, width: 201, height: 300 },
    ],
  });
}

/** The same secret on both pages, so one of the two copies can be left alone. */
async function secretOnBothPages(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: [
      { label: SECRET, width: 200, height: 300 },
      { label: SECRET, width: 200, height: 300 },
    ],
  });
}

/** A search hit on page 2 — used on a mark that was placed on page 1 by mistake. */
const HIT_ON_PAGE_2 = { page: 2, text: SECRET, index: 9, quads: [] };

describe('applyRedactions', () => {
  it('destroys the marked text and hands back a verified receipt', async () => {
    const before = await twoPages();
    expect(containsText(before, SECRET)).toBe(true);

    const outcome = await applyRedactions(before, options([mark(1)]), {
      rasterize: rasterPort([
        { width: 200, height: 300 },
        { width: 201, height: 300 },
      ]),
    });

    expect(containsText(outcome.result.bytes, SECRET)).toBe(false);
    expect(containsText(outcome.result.bytes, SURVIVOR)).toBe(true);
    expect(outcome.result.detail).toEqual({
      verified: true,
      pagesRebuilt: [1],
      instancesDestroyed: 1,
      survivingStrings: [],
      pagesStillCarryingText: [],
      terms: [{ text: SECRET, before: 1, remaining: 0, marked: 1 }],
    });
  });

  it('keeps the page count, sizes, and rotations of the whole document', async () => {
    const before = await makeTestPdf({
      pages: [
        { label: SECRET, width: 200, height: 300, rotation: 270 },
        { label: SURVIVOR, width: 201, height: 300 },
      ],
    });
    const outcome = await applyRedactions(before, options([mark(1)]), {
      rasterize: rasterPort([
        { width: 200, height: 300, rotation: 270 },
        { width: 201, height: 300 },
      ]),
    });
    expect(outcome.result).toMatchObject({ pagesIn: 2, pagesOut: 2 });
    expect(await pageWidths(outcome.result.bytes)).toEqual([200, 201]);
    expect(await pageRotations(outcome.result.bytes)).toEqual([270, 0]);
    expect(containsText(outcome.result.bytes, SECRET)).toBe(false);
  });

  it('paints the marked pixels black on the burned raster it rebuilt from', async () => {
    const before = await twoPages();
    const outcome = await applyRedactions(before, options([mark(1)]), {
      rasterize: rasterPort([
        { width: 200, height: 300 },
        { width: 201, height: 300 },
      ]),
    });
    const burned = outcome.burned[0];
    expect(burned?.page).toBe(1);
    expect(burned?.paintedPixels).toBe(120 * 30);
    // The mark spans y = 190..220 in PDF points, i.e. rows 80..110 top-down.
    expect(pixelAt(burned?.png ?? new Uint8Array(), 20, 85)).toEqual([0, 0, 0]);
    expect(pixelAt(burned?.png ?? new Uint8Array(), 20, 5)).toEqual([255, 255, 255]);
  });

  it('counts one instance per search hit, not per mark, and rebuilds every marked page', async () => {
    const before = await twoPages();
    const outcome = await applyRedactions(
      before,
      options([mark(1, 'a'), mark(1, 'b'), mark(2, 'c')], { verifyStrings: [SURVIVOR] }),
      {
        rasterize: rasterPort([
          { width: 200, height: 300 },
          { width: 201, height: 300 },
        ]),
      }
    );
    // Three marks, but the two on page 1 came from the SAME hit.
    expect(outcome.result.detail.instancesDestroyed).toBe(2);
    expect(outcome.result.detail.pagesRebuilt).toEqual([1, 2]);
    expect(containsText(outcome.result.bytes, SURVIVOR)).toBe(false);
  });

  /**
   * QA F-1. The secret is on both pages and only page 1 is marked. That is a
   * complete redaction of what was asked for, so the run SUCCEEDS — and the
   * receipt says plainly that one copy is still in the document.
   */
  it('destroys only the marked instance and reports the unmarked one', async () => {
    const before = await secretOnBothPages();
    const outcome = await applyRedactions(before, options([mark(1)]), {
      rasterize: rasterPort([
        { width: 200, height: 300 },
        { width: 200, height: 300 },
      ]),
    });

    expect(outcome.result.detail.verified).toBe(true);
    expect(outcome.result.detail.survivingStrings).toEqual([]);
    expect(outcome.result.detail.terms).toEqual([
      { text: SECRET, before: 2, remaining: 1, marked: 1 },
    ]);
    expect(outcome.targets).toEqual([{ text: SECRET, occurrencesBefore: 2, markedInstances: 1 }]);
  });

  /**
   * The genuine survivor. Both instances are marked, but the second mark's
   * rectangle was placed on page 1 instead of the page its hit came from — the
   * burn destroys the wrong region and the attorney's second marked copy is
   * still readable. Two copies were marked, one died: the run is abandoned.
   */
  it('REFUSES to return a document when a marked instance is still readable', async () => {
    const before = await secretOnBothPages();
    const misplaced: RedactionBox = { ...mark(1, 'stray'), sourceMatch: HIT_ON_PAGE_2 };
    await expect(
      applyRedactions(before, options([mark(1), misplaced]), {
        rasterize: rasterPort([
          { width: 200, height: 300 },
          { width: 200, height: 300 },
        ]),
      })
    ).rejects.toThrow(RedactionNotVerifiedError);
  });

  it('says the MARKED copies survived, not that the term is in the document', async () => {
    const before = await secretOnBothPages();
    const misplaced: RedactionBox = { ...mark(1, 'stray'), sourceMatch: HIT_ON_PAGE_2 };
    await expect(
      applyRedactions(before, options([mark(1), misplaced]), {
        rasterize: rasterPort([
          { width: 200, height: 300 },
          { width: 200, height: 300 },
        ]),
      })
    ).rejects.toThrow(/the marked copies of 1 term are still readable/);
  });

  it('streams plain-English progress for every page and the verification', async () => {
    const before = await twoPages();
    const onProgress = vi.fn();
    await applyRedactions(before, options([mark(1)]), {
      rasterize: rasterPort([
        { width: 200, height: 300 },
        { width: 201, height: 300 },
      ]),
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith(PHASE_RASTERIZE, 1, 1, 'Page 1');
    expect(onProgress).toHaveBeenCalledWith(PHASE_VERIFY, 1, 1);
  });

  it('refuses to run with nothing marked', async () => {
    const before = await twoPages();
    await expect(
      applyRedactions(before, options([]), { rasterize: rasterPort([]) })
    ).rejects.toThrow(NoRedactionMarksError);
  });

  it('refuses a raster that came back empty rather than rebuilding a blank page', async () => {
    const before = await twoPages();
    await expect(
      applyRedactions(before, options([mark(1)]), {
        rasterize: () => Promise.resolve({ png: new Uint8Array(0), widthPx: 0, heightPx: 0 }),
      })
    ).rejects.toThrow(/rasterized to no image data/);
  });
});

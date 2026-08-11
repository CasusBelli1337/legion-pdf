import { describe, expect, it } from 'vitest';
import { getBookmarks } from '@core/ops';
import { containsText, makeTestPdf, pageRotations, pageWidths } from '@core/ops/test-fixtures';
import { PDFDocument } from 'pdf-lib';
import { rebuildWithImagePages } from './image-pages';
import { REDACTED_TITLE } from './carry-over';
import { shownCharactersOn } from './page-content';
import { fakePageRaster } from './raster.testkit';
import type { BurnedRaster } from './image-pages';

const SECRET = 'SSN 545-45-6789';
const SURVIVOR = 'MUST-SURVIVE-REDACTION';

/** Page 1 carries the secret; page 2 must come through untouched. */
async function twoPageSource(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: [
      { label: SECRET, width: 200, height: 300 },
      { label: SURVIVOR, width: 201, height: 300 },
    ],
  });
}

function rasterFor(page: number, width: number, height: number, rotation = 0): BurnedRaster {
  const raster = fakePageRaster({ crop: { x: 0, y: 0, width, height }, rotation, dpi: 72 });
  return { page, png: raster.png, widthPx: raster.widthPx, heightPx: raster.heightPx };
}

describe('rebuildWithImagePages', () => {
  it('DESTROYS the text of a rebuilt page — before: present, after: absent', async () => {
    const before = await twoPageSource();
    expect(containsText(before, SECRET)).toBe(true);

    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    expect(containsText(after.bytes, SECRET)).toBe(false);
  });

  it('leaves the pages it was not asked to touch fully intact', async () => {
    const before = await twoPageSource();
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    expect(containsText(after.bytes, SURVIVOR)).toBe(true);
  });

  it('keeps the page count and every page size', async () => {
    const before = await twoPageSource();
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    expect(after).toMatchObject({ pagesIn: 2, pagesOut: 2 });
    expect(await pageWidths(after.bytes)).toEqual([200, 201]);
  });

  it('keeps /Rotate on the rebuilt page, so the page is not silently re-oriented', async () => {
    const before = await makeTestPdf({
      pages: [{ label: SECRET, width: 200, height: 300, rotation: 90 }, { label: SURVIVOR }],
    });
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300, 90)], [SECRET]);
    expect(await pageRotations(after.bytes)).toEqual([90, 0]);
    expect(await pageWidths(after.bytes)).toEqual([200, 300]);
    expect(containsText(after.bytes, SECRET)).toBe(false);
  });

  it('leaves the rebuilt page drawing NO text at all', async () => {
    const before = await twoPageSource();
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    const document = await PDFDocument.load(after.bytes, { updateMetadata: false });
    expect(shownCharactersOn(document, 1)).toBe(0);
    expect(shownCharactersOn(document, 2)).toBeGreaterThan(0);
  });

  it('rebuilds every marked page when several are marked', async () => {
    const before = await twoPageSource();
    const after = await rebuildWithImagePages(
      before,
      [rasterFor(1, 200, 300), rasterFor(2, 201, 300)],
      [SECRET, SURVIVOR]
    );
    expect(containsText(after.bytes, SECRET)).toBe(false);
    expect(containsText(after.bytes, SURVIVOR)).toBe(false);
    expect(after.pagesOut).toBe(2);
  });

  it('carries the outline across but silences a title quoting destroyed text', async () => {
    const before = await makeTestPdf({
      pages: [{ label: SECRET, width: 200, height: 300 }, { label: SURVIVOR }],
      bookmarks: [
        {
          title: `Account ${SECRET}`,
          page: 1,
          children: [{ title: 'Closing statement', page: 2, children: [] }],
        },
      ],
    });
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    const outline = await getBookmarks(after.bytes);
    expect(outline[0]?.title).toBe(REDACTED_TITLE);
    expect(outline[0]?.children[0]?.title).toBe('Closing statement');
    expect(containsText(after.bytes, SECRET)).toBe(false);
  });

  it('carries clean document information and drops the fields that quote the secret', async () => {
    const before = await makeTestPdf({
      pages: [{ label: SECRET, width: 200, height: 300 }, { label: SURVIVOR }],
      info: { Author: 'Rothrock Legal', Title: `File for ${SECRET}` },
    });
    const after = await rebuildWithImagePages(before, [rasterFor(1, 200, 300)], [SECRET]);
    expect(after.droppedMetadata).toEqual(['Title']);
    const document = await PDFDocument.load(after.bytes, { updateMetadata: false });
    expect(document.getAuthor()).toBe('Rothrock Legal');
    expect(document.getTitle()).toBeUndefined();
  });

  it('refuses a rebuild that was handed no burned pages', async () => {
    const before = await twoPageSource();
    await expect(rebuildWithImagePages(before, [], [SECRET])).rejects.toThrow(
      /nothing would be destroyed/
    );
  });

  it('refuses a page number outside the document', async () => {
    const before = await twoPageSource();
    await expect(rebuildWithImagePages(before, [rasterFor(9, 200, 300)], [SECRET])).rejects.toThrow(
      RangeError
    );
  });

  it('refuses the same page burned twice', async () => {
    const before = await twoPageSource();
    await expect(
      rebuildWithImagePages(before, [rasterFor(1, 200, 300), rasterFor(1, 200, 300)], [SECRET])
    ).rejects.toThrow(/burned twice/);
  });

  it('refuses a raster of the wrong page', async () => {
    const before = await twoPageSource();
    // A landscape raster for an upright page: right file, wrong picture.
    await expect(rebuildWithImagePages(before, [rasterFor(1, 300, 200)], [SECRET])).rejects.toThrow(
      /refusing to rebuild the page from the wrong picture/
    );
  });
});

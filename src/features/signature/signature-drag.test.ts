import { describe, expect, it } from 'vitest';
import type { PageSize, PdfPoint } from '@shared/types';
import type { ClientPoint, ViewerApi } from '@renderer/components/viewer';
import { pageAtClientPoint } from './signature-drag';

const SIZE: PageSize = { width: 100, height: 200 };

/**
 * Two pages stacked with a gutter, each 100x200 points shown at 1:1. Page 1
 * occupies client x 10-110, y 10-210; page 2 sits twenty pixels below it.
 * `mounted` is the set the viewer has actually rendered — everything else
 * answers null, exactly as the real viewer does for a page off screen.
 */
function viewer(mounted: readonly number[] = [1, 2]): ViewerApi {
  const topOf = (page: number): number => 10 + (page - 1) * 220;
  const isMounted = (page: number): boolean => mounted.includes(page);

  return {
    docId: 'doc-1',
    pageCount: 2,
    currentPage: 1,
    zoom: 1,
    setZoom: () => undefined,
    goToPage: () => undefined,
    pageSize: (page) => (isMounted(page) ? SIZE : null),
    pdfToClient: (page, point): ClientPoint | null =>
      isMounted(page) ? { x: 10 + point.x, y: topOf(page) + (SIZE.height - point.y) } : null,
    clientToPdf: (page, point): PdfPoint | null =>
      isMounted(page) ? { x: point.x - 10, y: SIZE.height - (point.y - topOf(page)) } : null,
    registerOverlay: () => () => undefined,
    findText: async () => [],
  };
}

describe('finding the page a signature was dropped on', () => {
  it('reads a drop on the first page as a point on that page', () => {
    expect(pageAtClientPoint(viewer(), { x: 60, y: 110 })).toEqual({
      page: 1,
      at: { x: 50, y: 100 },
    });
  });

  it('reads a drop on the second page as the second page, not the first', () => {
    const target = pageAtClientPoint(viewer(), { x: 60, y: 330 });
    expect(target?.page).toBe(2);
    expect(target?.at).toEqual({ x: 50, y: 100 });
  });

  // Dropping in the gutter, on the toolbar, or on the dock is not a placement.
  it('lands nowhere when the drop missed every page', () => {
    expect(pageAtClientPoint(viewer(), { x: 60, y: 215 })).toBeNull();
    expect(pageAtClientPoint(viewer(), { x: 400, y: 110 })).toBeNull();
    expect(pageAtClientPoint(viewer(), { x: 60, y: 0 })).toBeNull();
  });

  it('ignores a page that is scrolled out of view rather than guessing at it', () => {
    expect(pageAtClientPoint(viewer([2]), { x: 60, y: 110 })).toBeNull();
    expect(pageAtClientPoint(viewer([2]), { x: 60, y: 330 })?.page).toBe(2);
  });

  it('lands nowhere at all when no document is open', () => {
    expect(pageAtClientPoint(null, { x: 60, y: 110 })).toBeNull();
  });

  it('accepts a drop right on the page edge', () => {
    expect(pageAtClientPoint(viewer(), { x: 10, y: 210 })?.page).toBe(1);
  });
});

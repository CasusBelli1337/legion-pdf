import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import type { HighlightOptions, PdfRect } from '@shared/types';
import { annotationCounts, containsText, makeTestPdf } from '../ops/test-fixtures';
import { applyHighlight } from './highlight';
import { angleOf, marksOnPage, pageContent, place } from './stamp-testkit';

function pages(count: number, rotation?: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    label: `PAGE-${index + 1}`,
    width: 612,
    height: 792,
    ...(rotation === undefined ? {} : { rotation }),
  }));
}

function options(overrides: Partial<HighlightOptions> = {}): HighlightOptions {
  return {
    page: 1,
    rects: [{ x: 100, y: 400, width: 220, height: 18 }],
    ...overrides,
  };
}

/** Every /ExtGState on a page, as plain dictionaries. */
async function graphicsStates(bytes: Uint8Array, page: number): Promise<PDFDict[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const resources = document.getPage(page - 1).node.Resources();
  const states = resources?.lookup(PDFName.of('ExtGState'), PDFDict);
  if (states === undefined) return [];
  return states
    .entries()
    .map(([, value]) => document.context.lookup(value))
    .filter((value): value is PDFDict => value instanceof PDFDict);
}

/** Only the rects this op drew — the fixture page draws none of its own. */
async function highlightRects(bytes: Uint8Array, page: number) {
  return (await marksOnPage(bytes, page)).filter((mark) => mark.kind === 'rect');
}

describe('applyHighlight', () => {
  it('paints the box into the page content stream, in place', async () => {
    const bytes = await makeTestPdf({ pages: pages(2) });
    const result = await applyHighlight(bytes, options());

    expect(result.pagesIn).toBe(2);
    expect(result.pagesOut).toBe(2);

    const [rect] = await highlightRects(result.bytes, 1);
    expect(rect).toBeDefined();
    expect(place(rect?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 })).toEqual({ x: 100, y: 400 });
    expect(rect?.width).toBeCloseTo(220, 6);
    expect(rect?.height).toBeCloseTo(18, 6);
    expect(await highlightRects(result.bytes, 2)).toHaveLength(0);
  });

  // The difference between a highlight and a redaction, stated as a test.
  it('leaves the text under it exactly where it was, and still extractable', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await applyHighlight(bytes, options());
    expect(containsText(result.bytes, 'PAGE-1')).toBe(true);
    const text = (await marksOnPage(result.bytes, 1)).find((mark) => mark.kind === 'text');
    expect(text?.text).toBe('PAGE-1');
  });

  it('marks with a real transparency and a multiply blend, not a pale fill', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await applyHighlight(bytes, options());

    const states = await graphicsStates(result.bytes, 1);
    const translucent = states.find(
      (state) => state.lookup(PDFName.of('BM'))?.toString() === '/Multiply'
    );
    expect(translucent).toBeDefined();
    expect(Number(translucent?.lookup(PDFName.of('ca'))?.toString())).toBeLessThan(1);
    expect(Number(translucent?.lookup(PDFName.of('ca'))?.toString())).toBeGreaterThan(0);
    expect(await pageContent(result.bytes, 1)).toContain('gs');
  });

  it('defaults to highlighter yellow and takes any colour asked for', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const yellow = await applyHighlight(bytes, options());
    const pink = await applyHighlight(bytes, options({ color: '#FF00FF' }));
    expect(await pageContent(yellow.bytes, 1)).toMatch(/1 0\.92\d+ 0\.23\d+ rg/);
    expect(await pageContent(pink.bytes, 1)).toMatch(/1 0 1 rg/);
  });

  it('marks every box it was handed, in order', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const rects: PdfRect[] = [
      { x: 72, y: 700, width: 180, height: 14 },
      { x: 72, y: 680, width: 240, height: 14 },
      { x: 72, y: 660, width: 90, height: 14 },
    ];
    const result = await applyHighlight(bytes, options({ rects }));
    const drawn = await highlightRects(result.bytes, 1);
    expect(drawn).toHaveLength(3);
    expect(drawn.map((mark) => Math.round(mark.width))).toEqual([180, 240, 90]);
  });

  it('adds no annotation — another reader cannot lift the marker back off', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const result = await applyHighlight(bytes, options());
    expect(await annotationCounts(result.bytes)).toEqual([0]);
  });

  it('covers the same words on a rotated page', async () => {
    for (const rotation of [90, 180, 270]) {
      const bytes = await makeTestPdf({ pages: pages(1, rotation) });
      const result = await applyHighlight(bytes, options());
      const rect = (await highlightRects(result.bytes, 1))[0];
      if (rect === undefined) throw new Error('The highlight drew nothing.');
      expect(angleOf(rect.matrix)).toBe(rotation);
      // Turned back, the painted box lands on exactly the rect that was asked
      // for — the words the attorney dragged over, not a corner away from them.
      const corner = place(rect.matrix, { x: 0, y: 0 });
      const opposite = place(rect.matrix, { x: rect.width, y: rect.height });
      expect(Math.min(corner.x, opposite.x)).toBeCloseTo(100, 4);
      expect(Math.min(corner.y, opposite.y)).toBeCloseTo(400, 4);
      expect(Math.max(corner.x, opposite.x)).toBeCloseTo(320, 4);
      expect(Math.max(corner.y, opposite.y)).toBeCloseTo(418, 4);
    }
  });

  it('takes a box dragged out backwards the same as one dragged forwards', async () => {
    const bytes = await makeTestPdf({ pages: pages(1) });
    const backwards = await applyHighlight(
      bytes,
      options({ rects: [{ x: 320, y: 418, width: -220, height: -18 }] })
    );
    const [rect] = await highlightRects(backwards.bytes, 1);
    expect(place(rect?.matrix ?? [1, 0, 0, 1, 0, 0], { x: 0, y: 0 })).toEqual({ x: 100, y: 400 });
  });

  describe('refusals', () => {
    it('refuses a page the document does not have', async () => {
      const bytes = await makeTestPdf({ pages: pages(2) });
      await expect(applyHighlight(bytes, options({ page: 5 }))).rejects.toThrow(/no page 5/);
    });

    it('refuses an empty selection rather than reporting a highlight of nothing', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyHighlight(bytes, options({ rects: [] }))).rejects.toThrow(
        /nothing was selected/
      );
    });

    it('names the collapsed box when one of several has no area', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      const rects: PdfRect[] = [
        { x: 72, y: 700, width: 180, height: 14 },
        { x: 72, y: 680, width: 240, height: 0 },
      ];
      await expect(applyHighlight(bytes, options({ rects }))).rejects.toThrow(/area 2/);
    });

    it('refuses a colour it cannot read', async () => {
      const bytes = await makeTestPdf({ pages: pages(1) });
      await expect(applyHighlight(bytes, options({ color: 'yellow-ish' }))).rejects.toThrow(
        /#RRGGBB/
      );
    });
  });
});

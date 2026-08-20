/**
 * The WYSIWYG contract, proved in numbers: a box drawn on the page becomes the
 * same `stamp:textBox` options whatever the zoom, and the typing surface's
 * first baseline lands on the engine's first baseline.
 *
 * The viewer's transform is rebuilt by ./viewer-transform.testkit exactly as
 * pdfjs builds it (upright and quarter-turned) so the round trip under test is
 * the real one. What lands in a real FILE at the end of that round trip is
 * proved separately, in ./wysiwyg-wrap.test.ts.
 */

import { describe, expect, it } from 'vitest';
import type { PdfRect, TextFontChoice } from '@shared/types';
import { ascentPt, fontHeightPt, lineStepPt } from './font-metrics';
import {
  BOX_INSET_PT,
  editorLayout,
  firstLineOriginClient,
  isTypeable,
  toTextBoxOptions,
  toWhiteoutRect,
  wrapWidthPt,
  type FontBox,
} from './text-geometry';
import {
  applyInverse,
  localBox,
  quarterTurned,
  upright,
  type Matrix,
} from './viewer-transform.testkit';

const FONT: TextFontChoice = { family: 'helvetica' };
const DRAFT = {
  text: 'Objection sustained.',
  fontSize: 12,
  color: '#000000',
  font: FONT,
  underline: false,
};
const RECT: PdfRect = { x: 100, y: 600, width: 200, height: 50 };

/** The whole commit path: drawn rect → screen → back through clientToPdf. */
function commit(rect: PdfRect, transform: Matrix, scale: number, fontSize = 12) {
  const box = localBox(transform, rect);
  const origin = firstLineOriginClient(box, scale, FONT, fontSize);
  const at = applyInverse(transform, origin);
  return toTextBoxOptions({
    ...DRAFT,
    fontSize,
    page: 3,
    at,
    wrapWidthPt: wrapWidthPt(box, scale),
  });
}

describe('the drawn box becomes text-box options', () => {
  it('starts the first line inside the top-left corner of the box', () => {
    const options = commit(RECT, upright(1, 792), 1);
    expect(options.page).toBe(3);
    expect(options.at.x).toBeCloseTo(102, 6);
    // Top of the box, in, then down by one line's full height.
    expect(options.at.y).toBeCloseTo(650 - BOX_INSET_PT - fontHeightPt('helvetica', 12), 6);
  });

  it('wraps at the box width, inset on both sides', () => {
    expect(commit(RECT, upright(1, 792), 1).maxWidthPt).toBeCloseTo(196, 6);
  });

  it('carries the chosen face and colour through untouched', () => {
    const options = toTextBoxOptions({
      ...DRAFT,
      font: { family: 'times', bold: true, italic: true },
      color: '#7C3AED',
      page: 1,
      at: { x: 0, y: 0 },
      wrapWidthPt: 100,
    });
    expect(options.font).toEqual({ family: 'times', bold: true, italic: true });
    expect(options.color).toBe('#7C3AED');
    expect(options.text).toBe('Objection sustained.');
  });

  it('carries the underline choice through to the engine', () => {
    const request = { ...DRAFT, page: 1, at: { x: 0, y: 0 }, wrapWidthPt: 100 };
    expect(toTextBoxOptions(request).underline).toBe(false);
    expect(toTextBoxOptions({ ...request, underline: true }).underline).toBe(true);
  });

  it('is independent of zoom — 50% and 400% produce the same options', () => {
    const small = commit(RECT, upright(0.5, 792), 0.5);
    const large = commit(RECT, upright(4, 792), 4);
    expect(small.at.x).toBeCloseTo(large.at.x, 6);
    expect(small.at.y).toBeCloseTo(large.at.y, 6);
    expect(small.maxWidthPt).toBeCloseTo(large.maxWidthPt ?? 0, 6);
  });

  it('is independent of font size only where it should be', () => {
    const twelve = commit(RECT, upright(1, 792), 1, 12);
    const twenty = commit(RECT, upright(1, 792), 1, 20);
    expect(twelve.maxWidthPt).toBeCloseTo(twenty.maxWidthPt ?? 0, 6);
    expect(twenty.at.y).toBeLessThan(twelve.at.y);
  });

  it('wraps at the box as DISPLAYED on a quarter-turned page', () => {
    // Rotated 90, the box's on-screen width comes from its user-space height.
    const box = localBox(quarterTurned(2), RECT);
    expect(wrapWidthPt(box, 2)).toBeCloseTo(RECT.height - 2 * BOX_INSET_PT, 6);
  });

  it('keeps the origin inside the box on a quarter-turned page', () => {
    const options = commit(RECT, quarterTurned(2), 2);
    expect(options.at.x).toBeGreaterThanOrEqual(RECT.x);
    expect(options.at.x).toBeLessThanOrEqual(RECT.x + RECT.width);
    expect(options.at.y).toBeGreaterThanOrEqual(RECT.y);
    expect(options.at.y).toBeLessThanOrEqual(RECT.y + RECT.height);
  });
});

describe('a box worth typing in', () => {
  it('accepts a real drag', () => {
    expect(isTypeable(RECT)).toBe(true);
  });

  it('rejects a stray click and a hairline drag', () => {
    expect(isTypeable({ x: 10, y: 10, width: 0, height: 0 })).toBe(false);
    expect(isTypeable({ x: 10, y: 10, width: 200, height: 3 })).toBe(false);
  });

  it('accepts a box dragged right-to-left or bottom-to-top', () => {
    expect(isTypeable({ x: 300, y: 650, width: -200, height: -50 })).toBe(true);
  });
});

describe('the whiteout rectangle', () => {
  it('normalises a box dragged backwards', () => {
    expect(toWhiteoutRect({ x: 300, y: 650, width: -200, height: -50 })).toEqual({
      x: 100,
      y: 600,
      width: 200,
      height: 50,
    });
  });
});

/** Where the browser actually draws the baseline inside one line box. */
function screenBaseline(
  layout: { fontSizePx: number; lineHeightPx: number },
  fontBox: FontBox
): number {
  const height = (fontBox.ascent + fontBox.descent) * layout.fontSizePx;
  return (layout.lineHeightPx - height) / 2 + fontBox.ascent * layout.fontSizePx;
}

describe('the typing surface', () => {
  const box = localBox(upright(1, 792), RECT);

  it('lines its first baseline up with the engine on a measured screen font', () => {
    // Arial as Chromium reports it: taller than the PDF face, which is the
    // whole reason half-leading has to be taken out.
    const arial: FontBox = { ascent: 1.0056, descent: 0.2119 };
    const layout = editorLayout(box, 1, FONT, 12, arial);
    expect(layout.top + screenBaseline(layout, arial)).toBeCloseTo(
      box.top + BOX_INSET_PT + ascentPt('helvetica', 12),
      6
    );
  });

  it('falls back to the PDF face when the screen font cannot be measured', () => {
    const layout = editorLayout(box, 1, FONT, 12, null);
    const assumed: FontBox = {
      ascent: ascentPt('helvetica', 12) / 12,
      descent: (fontHeightPt('helvetica', 12) - ascentPt('helvetica', 12)) / 12,
    };
    expect(layout.top + screenBaseline(layout, assumed)).toBeCloseTo(
      box.top + BOX_INSET_PT + ascentPt('helvetica', 12),
      6
    );
  });

  it('steps between lines exactly as the engine does', () => {
    const layout = editorLayout(box, 2, { family: 'times' }, 14, null);
    expect(layout.lineHeightPx).toBeCloseTo(lineStepPt('times', 14) * 2, 6);
    expect(layout.fontSizePx).toBeCloseTo(28, 6);
  });

  /**
   * The surface's CSS width and the engine's `maxWidthPt` are computed by
   * different code. They have to say the same thing at EVERY zoom, or the
   * preview wraps in one place and the file wraps in another — which is the
   * whole bug core/stamps/text-box-wrap.test.ts stamps a page to catch.
   */
  it('is the wrap width at every zoom, so screen and file break in the same place', () => {
    for (const scale of [0.25, 0.5, 1, 1.32, 2, 4, 8]) {
      const drawn = localBox(upright(scale, 792), RECT);
      const layout = editorLayout(drawn, scale, FONT, 12, null);
      expect(layout.width / scale).toBeCloseTo(wrapWidthPt(drawn, scale), 6);
    }
  });

  it('never collapses below one line, whatever was dragged', () => {
    const thin = localBox(upright(1, 792), { x: 100, y: 600, width: 200, height: 4 });
    expect(editorLayout(thin, 1, FONT, 12, null).height).toBeCloseTo(
      lineStepPt('helvetica', 12),
      6
    );
  });
});

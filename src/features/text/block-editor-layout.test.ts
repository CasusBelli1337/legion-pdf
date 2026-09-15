import { describe, expect, it } from 'vitest';
import type { PageOverlayContext } from '@renderer/components/viewer';
import type { TextEditBlock } from '@shared/types';
import { blockEditorLayout, screenFontFor } from './block-editor-layout';
import { ascentPt } from './font-metrics';

/** A page shown at 2 CSS px per point, top-left of the page at (0, 0), 400pt tall. */
function context(scale = 2, height = 400): PageOverlayContext {
  return {
    page: 1,
    rect: { left: 0, top: 0, width: 612 * scale, height: height * scale },
    scale,
    size: { width: 612, height },
    toLocalBox: (rect) => ({
      left: rect.x * scale,
      top: (height - rect.y - rect.height) * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    }),
  };
}

const BLOCK: TextEditBlock = {
  page: 1,
  rect: { x: 60, y: 268, width: 240, height: 46 },
  lines: [
    { text: 'First line, indented', origin: { x: 78, y: 300 }, width: 200 },
    { text: 'second line', origin: { x: 60, y: 286 }, width: 240 },
    { text: 'third.', origin: { x: 60, y: 272 }, width: 60 },
  ],
  text: 'First line, indented\nsecond line\nthird.',
  font: {
    documentFont: 'TimesNewRomanPSMT',
    sizePt: 12,
    colorHex: '#000000',
    bold: false,
    italic: false,
    designFamily: 'serif',
    reusable: true,
  },
  leadingPt: 14,
  alignment: 'left',
  angle: 0,
};

describe('screenFontFor', () => {
  it('stands the document font in with the closest built-in face and its styling', () => {
    expect(screenFontFor(BLOCK)).toEqual({ family: 'times' });
    expect(
      screenFontFor({ ...BLOCK, font: { ...BLOCK.font, documentFont: 'Calibri-Bold', bold: true } })
    ).toEqual({ family: 'helvetica', bold: true });
    expect(
      screenFontFor({
        ...BLOCK,
        font: { ...BLOCK.font, documentFont: '', designFamily: 'monospace' },
      })
    ).toEqual({ family: 'courier' });
  });
});

describe('blockEditorLayout', () => {
  it('lands the first baseline on the first line origin at the page scale', () => {
    const layout = blockEditorLayout(BLOCK, context(), null, 0);
    // No screen font box: the PDF face's own ascent is assumed, so the baseline
    // sits (lineHeight - height) / 2 + ascent below the top of the surface.
    const ascent = ascentPt('times', 12) * 2;
    const baselineTop = (400 - 300) * 2;
    expect(layout.top + (layout.lineHeightPx - 2 * (0.9 * 12)) / 2 + ascent).toBeCloseTo(
      baselineTop,
      6
    );
    expect(layout.left).toBe(60 * 2);
    expect(layout.fontSizePx).toBe(24);
    expect(layout.lineHeightPx).toBe(28);
    expect(layout.height).toBe(28 * 3);
  });

  it('carries the first-line indent, alignment, and measure into the surface style', () => {
    const layout = blockEditorLayout({ ...BLOCK, alignment: 'justify' }, context(), null, 0);
    expect(layout.style.textIndent).toBe(`${18 * 2}px`);
    expect(layout.style.textAlign).toBe('justify');
    expect(layout.width).toBe(240 * 2 + 2);
    expect(layout.style.transform).toBeUndefined();
  });

  it('turns the surface for text running at an angle', () => {
    const layout = blockEditorLayout({ ...BLOCK, angle: 90 }, context(), null, 0);
    expect(layout.style.transform).toBe('rotate(-90deg)');
  });

  it('never shrinks below the text the attorney has typed', () => {
    expect(blockEditorLayout(BLOCK, context(), null, 500).height).toBe(500);
  });
});

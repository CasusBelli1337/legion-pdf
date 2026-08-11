/**
 * The screen has to measure text the way the engine does. These numbers are
 * Adobe's AFM metrics for the PDF standard fonts, restated in the renderer
 * because it may not import `core/` — so the last test here is a drift guard
 * against the engine's own line spacing.
 */

import { describe, expect, it } from 'vitest';
import textBoxSource from '../../../core/stamps/text-box.ts?raw';
import {
  ascentPt,
  cssFontShorthand,
  cssFontStack,
  familyLabel,
  fontHeightPt,
  LINE_SPACING,
  lineStepPt,
} from './font-metrics';

describe('the three faces', () => {
  it('measures a line the way pdf-lib does', () => {
    // (Ascender - Descender) / 1000 * size, from the AFM files pdf-lib embeds.
    expect(fontHeightPt('helvetica', 12)).toBeCloseTo(12 * 0.925, 9);
    expect(fontHeightPt('times', 12)).toBeCloseTo(12 * 0.9, 9);
    expect(fontHeightPt('courier', 12)).toBeCloseTo(12 * 0.786, 9);
  });

  it('puts the baseline an ascender below the top', () => {
    expect(ascentPt('helvetica', 12)).toBeCloseTo(12 * 0.718, 9);
    expect(ascentPt('times', 12)).toBeCloseTo(12 * 0.683, 9);
    expect(ascentPt('courier', 12)).toBeCloseTo(12 * 0.629, 9);
  });

  it("steps between lines by the engine's own multiple", () => {
    expect(lineStepPt('helvetica', 12)).toBeCloseTo(12 * 0.925 * LINE_SPACING, 9);
  });

  it('offers only metric-compatible screen stand-ins', () => {
    expect(cssFontStack('helvetica')).toContain('Arial');
    expect(cssFontStack('times')).toContain('Times New Roman');
    expect(cssFontStack('courier')).toContain('Courier New');
  });

  it('builds a CSS font shorthand for a face', () => {
    expect(cssFontShorthand({ family: 'times', bold: true, italic: true }, 100)).toBe(
      "italic 700 100px 'Times New Roman', Times, 'Liberation Serif', serif"
    );
    expect(cssFontShorthand({ family: 'courier' }, 12)).toBe(
      "400 12px 'Courier New', Courier, 'Liberation Mono', monospace"
    );
  });
});

describe('naming a face for the attorney', () => {
  it('uses the words on the toolbar', () => {
    expect(familyLabel({ family: 'helvetica' })).toBe('Helvetica');
    expect(familyLabel({ family: 'times', bold: true })).toBe('Times bold');
    expect(familyLabel({ family: 'courier', italic: true })).toBe('Courier italic');
    expect(familyLabel({ family: 'times', bold: true, italic: true })).toBe('Times bold italic');
  });
});

describe('drift guard', () => {
  it("keeps the renderer line spacing equal to the engine's", () => {
    expect(textBoxSource).toContain(`const LINE_SPACING = ${LINE_SPACING};`);
  });
});

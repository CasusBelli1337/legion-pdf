import { describe, expect, it } from 'vitest';
import { planImages } from './images';
import { image, page } from './layout-testkit';

const FRAME = { left: 72, right: 540, textRight: 540 };

describe('planImages', () => {
  it('leaves a scan out and keeps its recognized text, with a note', () => {
    const layout = page([], { page: 4, images: [image(0, 0, 612, 792)] });
    const plan = planImages(layout, FRAME, { hasText: true, hasHiddenText: true });
    expect(plan.paragraphs).toEqual([]);
    expect(plan.notes[0]).toMatch(/Page 4 is a scan/);
  });

  it('keeps a full-page picture on a page with no text', () => {
    const layout = page([], { images: [image(0, 0, 612, 792)] });
    const plan = planImages(layout, FRAME, { hasText: false, hasHiddenText: false });
    expect(plan.paragraphs).toHaveLength(1);
    expect(plan.paragraphs[0]!.widthPt).toBeCloseTo(468);
    expect(plan.paragraphs[0]!.heightPt).toBeCloseTo((468 / 612) * 792);
  });

  it('places a picture inline at its own size, aligned as it sat', () => {
    const layout = page([], {
      images: [
        image(72, 400, 150, 100),
        image(390, 300, 150, 100),
        image(231, 200, 150, 100),
        image(120, 100, 150, 100),
      ],
    });
    const plan = planImages(layout, FRAME, { hasText: true, hasHiddenText: false });
    expect(plan.paragraphs.map((p) => p.alignment)).toEqual(['left', 'right', 'center', 'left']);
    expect(plan.paragraphs.map((p) => p.indentLeftPt)).toEqual([0, 0, 0, 48]);
    expect(plan.paragraphs[0]).toMatchObject({ widthPt: 150, heightPt: 100, top: 500 });
  });

  it('ignores specks', () => {
    const layout = page([], { images: [image(72, 400, 2, 2)] });
    expect(planImages(layout, FRAME, { hasText: true, hasHiddenText: false }).paragraphs).toEqual(
      []
    );
  });
});

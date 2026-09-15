import { describe, expect, it } from 'vitest';
import { isBehindPage, planImages, scannedPictureOf } from './images';
import { image, page, run } from './layout-testkit';

const FRAME = { left: 72, right: 540, textRight: 540 };

/** A scan: a full-page picture under the invisible text OCR left behind. */
function scanPage(pageNumber = 3) {
  return page([run('THE WITNESS: I did not sign it.', 72, 700, { hidden: true })], {
    page: pageNumber,
    images: [image(0, 0, 612, 792)],
  });
}

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

describe('what becomes of a scan picture', () => {
  const asked = { hasText: true, hasHiddenText: true };

  it("'omit' leaves it out and says so", () => {
    const plan = planImages(scanPage(), FRAME, { ...asked, scanPictures: 'omit' });
    expect(plan.paragraphs).toEqual([]);
    expect(plan.notes).toEqual([
      'Page 3 is a scan: the recognized text was kept as editable text and the picture was left out.',
    ]);
  });

  it("'appendix' keeps it for the appendix and leaves no note about losing it", () => {
    const plan = planImages(scanPage(), FRAME, { ...asked, scanPictures: 'appendix' });
    expect(plan.paragraphs).toEqual([]);
    expect(plan.notes).toEqual([]);
  });

  it("'behind' anchors the page-sized picture with a box of no height", () => {
    const layout = scanPage();
    const plan = planImages(layout, FRAME, { ...asked, scanPictures: 'behind' });
    expect(plan.notes).toEqual([]);
    expect(plan.paragraphs).toHaveLength(1);
    const anchor = plan.paragraphs[0]!;
    expect(isBehindPage(anchor)).toBe(true);
    expect(anchor).toMatchObject({ widthPt: 612, heightPt: 792 });
    // Top and bottom of the box are the same point, at the top of the text, so
    // the gap arithmetic above and below it adds up to what it was.
    expect(anchor.top).toBeCloseTo(700 + 0.8 * 12);
    expect(anchor.image.rect.y).toBeCloseTo(anchor.top);
  });

  it('never marks an ordinary picture as behind the page', () => {
    const layout = page([run('A photograph of the intersection.', 72, 700)], {
      images: [image(72, 400, 150, 100)],
    });
    const plan = planImages(layout, FRAME, {
      hasText: true,
      hasHiddenText: false,
      scanPictures: 'behind',
    });
    expect(plan.paragraphs).toHaveLength(1);
    expect(isBehindPage(plan.paragraphs[0]!)).toBe(false);
  });
});

describe('scannedPictureOf', () => {
  it('finds the full-page picture under invisible text', () => {
    expect(scannedPictureOf(scanPage())?.rect).toMatchObject({ width: 612, height: 792 });
  });

  it('is null when the text is real, when there is none, and when the picture is small', () => {
    const visible = page([run('Real text.', 72, 700)], { images: [image(0, 0, 612, 792)] });
    expect(scannedPictureOf(visible)).toBeNull();
    expect(scannedPictureOf(page([], { images: [image(0, 0, 612, 792)] }))).toBeNull();
    const small = page([run('Hidden.', 72, 700, { hidden: true })], {
      images: [image(72, 400, 150, 100)],
    });
    expect(scannedPictureOf(small)).toBeNull();
  });
});

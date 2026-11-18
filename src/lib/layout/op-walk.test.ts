import { describe, expect, it } from 'vitest';
import { countLetters, transformedBox, walkOperators } from './op-walk';
import type { OpsTable } from './op-walk';

/** A private numbering — the walker must look ops up by NAME, never assume pdfjs' numbers. */
const OPS: OpsTable = {
  save: 1,
  restore: 2,
  transform: 3,
  setFillRGBColor: 4,
  setTextRenderingMode: 5,
  showText: 6,
  paintImageXObject: 7,
  paintInlineImageXObject: 8,
  paintImageXObjectRepeat: 9,
  paintFormXObjectBegin: 10,
  paintFormXObjectEnd: 11,
  constructPath: 12,
  fill: 13,
  stroke: 14,
  eoFill: 15,
};

const glyphs = (text: string) => [...text].map((unicode) => ({ unicode }));

function list(entries: [number, unknown[]][]) {
  return { fnArray: entries.map(([fn]) => fn), argsArray: entries.map(([, args]) => args) };
}

describe('walkOperators', () => {
  it('stamps each show-text with the fill colour and visibility in force', () => {
    const walk = walkOperators(
      list([
        [OPS.setFillRGBColor!, ['#ff0000']],
        [OPS.showText!, [glyphs('Red 12')]],
        [OPS.setTextRenderingMode!, [3]],
        [OPS.setFillRGBColor!, ['#000000']],
        [OPS.showText!, [glyphs('hidden ocr')]],
      ]),
      OPS
    );
    expect(walk.texts).toEqual([
      { colorHex: '#ff0000', hidden: false, letters: 5 },
      { colorHex: '#000000', hidden: true, letters: 9 },
    ]);
  });

  it('places an image through the transform stack, including a form XObject', () => {
    const walk = walkOperators(
      list([
        [OPS.save!, []],
        [OPS.transform!, [1, 0, 0, 1, 100, 200]],
        [OPS.paintFormXObjectBegin!, [[2, 0, 0, 2, 10, 10], null]],
        [OPS.transform!, [50, 0, 0, 25, 0, 0]],
        [OPS.paintImageXObject!, ['img_p0_1', 500, 250]],
        [OPS.paintFormXObjectEnd!, []],
        [OPS.restore!, []],
        [OPS.paintImageXObject!, ['img_p0_2', 10, 10]],
      ]),
      OPS
    );
    expect(walk.images).toHaveLength(2);
    // The image's unit square → 50×25, ×2 and +10 inside the form, then +100,200.
    expect(transformedBox(walk.images[0]!.ctm, { x: 0, y: 0, width: 1, height: 1 })).toEqual({
      x: 110,
      y: 210,
      width: 100,
      height: 50,
    });
    expect(walk.images[1]!.ctm).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('expands a repeated image into one placement per position', () => {
    const walk = walkOperators(
      list([[OPS.paintImageXObjectRepeat!, ['img', 10, 10, new Float32Array([0, 0, 100, 100])]]]),
      OPS
    );
    expect(walk.images.map((image) => image.ctm[4])).toEqual([0, 100]);
  });

  it('keeps thin painted paths as rules and drops fat shapes and unpainted ones', () => {
    const walk = walkOperators(
      list([
        [OPS.constructPath!, [OPS.fill!, [null], new Float32Array([72, 699, 200, 699.6])]],
        [OPS.constructPath!, [OPS.fill!, [null], new Float32Array([72, 500, 300, 700])]],
        [OPS.constructPath!, [999, [null], new Float32Array([72, 400, 200, 400.5])]],
      ]),
      OPS
    );
    expect(walk.rules).toHaveLength(1);
    expect(walk.rules[0]).toMatchObject({ x: 72, y: 699, width: 128 });
  });
});

describe('checkboxes', () => {
  /** pdfjs' path data: moveTo is 0, lineTo is 1, close is 4. */
  const square = [0, 0, 0, 1, 11.6, 0, 1, 11.6, -11.6, 1, 0, -11.6, 4];
  const stroke = (data: number[], bounds: number[]): [number, unknown[]] => [
    OPS.constructPath!,
    [OPS.stroke!, [new Float32Array(data)], new Float32Array(bounds)],
  ];

  it('reads a small stroked square as an empty box, and one crossed corner to corner as checked', () => {
    const walk = walkOperators(
      list([
        stroke(square, [100, 400, 111.6, 411.6]),
        stroke(square, [100, 300, 111.6, 311.6]),
        stroke([0, 0, 0, 1, 11.8, -11.8], [99.9, 299.9, 111.7, 311.7]),
        stroke([0, 0, 0, 1, -11.8, -11.8], [99.9, 299.9, 111.7, 311.7]),
      ]),
      OPS
    );
    expect(walk.boxes.map((box) => box.checked)).toEqual([false, true]);
    expect(walk.boxes[1]!.rect).toMatchObject({ x: 100, y: 300 });
  });

  it('does not call a box checked for being outlined twice', () => {
    const walk = walkOperators(
      list([stroke(square, [100, 400, 111.6, 411.6]), stroke(square, [100, 400, 111.6, 411.6])]),
      OPS
    );
    expect(walk.boxes).toEqual([{ rect: expect.anything(), checked: false }]);
  });

  it('ignores filled squares, large frames, and a lone diagonal', () => {
    const walk = walkOperators(
      list([
        [
          OPS.constructPath!,
          [OPS.fill!, [new Float32Array(square)], new Float32Array([72, 500, 80, 508])],
        ],
        stroke(square, [72, 300, 200, 420]),
        stroke([0, 0, 0, 1, 10, 10], [300, 300, 310, 310]),
      ]),
      OPS
    );
    expect(walk.boxes).toEqual([]);
  });
});

describe('countLetters', () => {
  it('counts letters and digits, with ligatures decomposed', () => {
    expect(countLetters('Q. On page 3, yes')).toBe(11);
    expect(countLetters('ﬁne')).toBe(4);
    expect(countLetters('   ')).toBe(0);
  });
});

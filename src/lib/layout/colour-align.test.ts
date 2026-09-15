import { describe, expect, it } from 'vitest';
import { alignTextStyles } from './colour-align';

const op = (colorHex: string, letters: number, hidden = false) => ({ colorHex, hidden, letters });

describe('alignTextStyles', () => {
  it('gives each item the colour of the operator its first letter came from', () => {
    const styles = alignTextStyles(
      [{ str: 'Red ' }, { str: '' }, { str: 'and ' }, { str: 'blue' }],
      [op('#ff0000', 3), op('#000000', 3), op('#0000ff', 4)]
    );
    expect(styles.map((style) => style.colorHex)).toEqual([
      '#ff0000',
      '#000000',
      '#000000',
      '#0000ff',
    ]);
  });

  it('survives pdfjs splitting one operator across two items', () => {
    const styles = alignTextStyles([{ str: 'Hel' }, { str: 'lo' }], [op('#123456', 5)]);
    expect(styles.map((style) => style.colorHex)).toEqual(['#123456', '#123456']);
  });

  it('survives pdfjs merging two operators into one item', () => {
    const styles = alignTextStyles(
      [{ str: 'Hello' }, { str: 'world' }],
      [op('#111111', 2), op('#222222', 3), op('#333333', 5)]
    );
    expect(styles.map((style) => style.colorHex)).toEqual(['#111111', '#333333']);
  });

  it('falls back to black and visible once the operators run out', () => {
    const styles = alignTextStyles([{ str: 'abc' }, { str: 'def' }], [op('#ff0000', 3, true)]);
    expect(styles).toEqual([
      { colorHex: '#ff0000', hidden: true },
      { colorHex: '#000000', hidden: false },
    ]);
  });
});

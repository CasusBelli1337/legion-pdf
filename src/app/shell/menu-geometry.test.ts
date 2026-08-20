import { describe, expect, it } from 'vitest';
import { menuPosition } from './menu-geometry';

const MENU = { width: 180, height: 44 };
const WINDOW = { width: 1400, height: 900 };

describe('menuPosition', () => {
  it('opens down and to the right of the pointer', () => {
    expect(menuPosition({ x: 400, y: 300 }, MENU, WINDOW)).toEqual({ left: 400, top: 300 });
  });

  it('flips left rather than running off the right edge', () => {
    const { left } = menuPosition({ x: 1380, y: 300 }, MENU, WINDOW);
    expect(left).toBe(1200);
    expect(left + MENU.width).toBeLessThanOrEqual(WINDOW.width);
  });

  it('flips up rather than running under the status footer', () => {
    const { top } = menuPosition({ x: 400, y: 890 }, MENU, WINDOW);
    expect(top).toBe(846);
    expect(top + MENU.height).toBeLessThanOrEqual(WINDOW.height);
  });

  it('flips both ways in the bottom-right corner, keeping the edge margin', () => {
    // Flipping alone would put it at 1215/851, which is flush against the
    // window; the margin pulls it back to 1212/848.
    expect(menuPosition({ x: 1395, y: 895 }, MENU, WINDOW)).toEqual({ left: 1212, top: 848 });
  });

  it('keeps a margin at the top-left rather than touching the edge', () => {
    expect(menuPosition({ x: 0, y: 0 }, MENU, WINDOW)).toEqual({ left: 8, top: 8 });
  });

  it('still lands somewhere sane in a window smaller than the menu', () => {
    const position = menuPosition({ x: 40, y: 40 }, MENU, { width: 100, height: 30 });
    expect(position.left).toBe(8);
    expect(position.top).toBe(8);
  });
});

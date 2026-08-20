import { afterEach, describe, expect, it } from 'vitest';
import { getSelectionMenu, registerSelectionMenu } from './selection-menu-slot';
import { anchorFromRects, hasSelectedText } from './selection-anchor';
import type { RectLike } from './selection-anchor';

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe('selection menu slot', () => {
  afterEach(() => registerSelectionMenu(null));

  it('starts empty, so a build without the selection lane renders no menu', () => {
    expect(getSelectionMenu()).toBeNull();
  });

  it('holds the menu the selection lane registers', () => {
    const menu = () => null;
    registerSelectionMenu(menu);
    expect(getSelectionMenu()).toBe(menu);
  });

  it('empties again when the lane unregisters', () => {
    const stop = registerSelectionMenu(() => null);
    stop();
    expect(getSelectionMenu()).toBeNull();
  });

  it('a second registration replaces the first rather than stacking', () => {
    const first = () => null;
    const second = () => null;
    registerSelectionMenu(first);
    registerSelectionMenu(second);
    expect(getSelectionMenu()).toBe(second);
  });

  it('a stale unregister cannot pull out the menu that replaced it', () => {
    const first = () => null;
    const second = () => null;
    const stopFirst = registerSelectionMenu(first);
    registerSelectionMenu(second);

    stopFirst();

    expect(getSelectionMenu()).toBe(second);
  });
});

describe('anchorFromRects', () => {
  it('hangs the menu off the END of the selection', () => {
    const anchor = anchorFromRects([rect(10, 10, 100, 12), rect(10, 24, 60, 12)], { x: 0, y: 0 });
    expect(anchor).toEqual({ x: 70, y: 36 });
  });

  it('ignores the zero-size rects a browser reports at a range boundary', () => {
    const anchor = anchorFromRects([rect(10, 10, 100, 12), rect(200, 40, 0, 0)], { x: 0, y: 0 });
    expect(anchor).toEqual({ x: 110, y: 22 });
  });

  it('falls back to the pointer when the selection reports nothing usable', () => {
    expect(anchorFromRects([], { x: 42, y: 84 })).toEqual({ x: 42, y: 84 });
  });
});

describe('hasSelectedText', () => {
  const selection = (text: string, collapsed = false): Selection =>
    ({ isCollapsed: collapsed, toString: () => text }) as unknown as Selection;

  it('is false with no selection at all', () => {
    expect(hasSelectedText(null)).toBe(false);
  });

  it('is false for a plain click, which collapses the selection', () => {
    expect(hasSelectedText(selection('', true))).toBe(false);
  });

  it('is false for a drag that caught only whitespace', () => {
    expect(hasSelectedText(selection('  \n '))).toBe(false);
  });

  it('is true once there is something to act on', () => {
    expect(hasSelectedText(selection('Q. State your name.'))).toBe(true);
  });
});

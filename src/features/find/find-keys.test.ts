import { describe, expect, it } from 'vitest';
import { findKeyAction, stepIndex } from './find-keys';

describe('findKeyAction', () => {
  it('searches on Enter before anything has been found', () => {
    expect(findKeyAction({ key: 'Enter' }, false)).toBe('search');
  });

  it('steps to the next hit on Enter once there are hits', () => {
    expect(findKeyAction({ key: 'Enter' }, true)).toBe('next');
  });

  it('steps backwards on Shift+Enter', () => {
    expect(findKeyAction({ key: 'Enter', shiftKey: true }, true)).toBe('previous');
  });

  it('walks the hits with the arrow keys', () => {
    expect(findKeyAction({ key: 'ArrowDown' }, true)).toBe('next');
    expect(findKeyAction({ key: 'ArrowUp' }, true)).toBe('previous');
  });

  it('leaves the arrows alone with nothing found, so the caret still moves', () => {
    expect(findKeyAction({ key: 'ArrowDown' }, false)).toBeNull();
    expect(findKeyAction({ key: 'ArrowUp' }, false)).toBeNull();
  });

  it('never steals a modified arrow from the OS', () => {
    expect(findKeyAction({ key: 'ArrowDown', ctrlKey: true }, true)).toBeNull();
    expect(findKeyAction({ key: 'ArrowUp', altKey: true }, true)).toBeNull();
    expect(findKeyAction({ key: 'ArrowDown', metaKey: true }, true)).toBeNull();
  });

  it('closes on Escape either way', () => {
    expect(findKeyAction({ key: 'Escape' }, false)).toBe('close');
    expect(findKeyAction({ key: 'Escape' }, true)).toBe('close');
  });

  it('ignores ordinary typing', () => {
    expect(findKeyAction({ key: 'a' }, true)).toBeNull();
    expect(findKeyAction({ key: 'Home' }, true)).toBeNull();
  });
});

describe('stepIndex', () => {
  it('walks forwards and wraps at the end', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
  });

  it('walks backwards and wraps at the start', () => {
    expect(stepIndex(2, -1, 3)).toBe(1);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });

  it('from nothing selected, Down lands on the first hit and Up on the last', () => {
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
  });

  it('has nowhere to go with no hits', () => {
    expect(stepIndex(-1, 1, 0)).toBe(-1);
    expect(stepIndex(0, -1, 0)).toBe(-1);
  });

  it('stays put on a single hit', () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, -1, 1)).toBe(0);
  });
});

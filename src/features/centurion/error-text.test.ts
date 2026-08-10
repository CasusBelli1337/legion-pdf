import { describe, expect, it } from 'vitest';
import { isMissingKey, readFailure } from './error-text';
import { contextLabel, selectedPages } from './ask-payload';
import type { ContextSelection } from './ask-payload';

describe('readFailure', () => {
  it('unwraps the Electron IPC prefix and the taxonomy code', () => {
    const wrapped = new Error(
      "Error invoking remote method 'ai:ask': Error: [RATE_LIMIT] Wait about a minute and ask again."
    );
    expect(readFailure(wrapped)).toEqual({
      code: 'RATE_LIMIT',
      message: 'Wait about a minute and ask again.',
    });
  });

  it('passes an untagged message through as UNKNOWN', () => {
    expect(readFailure(new Error('The renderer blew up'))).toEqual({
      code: 'UNKNOWN',
      message: 'The renderer blew up',
    });
  });

  it('never leaves the attorney with a blank message', () => {
    expect(readFailure(new Error('')).message).toMatch(/unexpected problem/);
    expect(readFailure(new Error('[NO_KEY]')).message).toMatch(/unexpected problem/);
  });

  it('recognises the no-key case so the panel can offer key setup', () => {
    expect(isMissingKey(readFailure(new Error('[NO_KEY] No API key yet.')))).toBe(true);
    expect(isMissingKey(readFailure(new Error('[BAD_KEY] Rejected.')))).toBe(false);
  });
});

describe('context selection', () => {
  function selection(overrides: Partial<ContextSelection> = {}): ContextSelection {
    return { mode: 'whole', from: 1, to: 1, currentPage: 1, pageCount: 312, ...overrides };
  }

  it('sends the whole document by default', () => {
    expect(selectedPages(selection())).toBeUndefined();
    expect(contextLabel(selection())).toBe('the whole document, pages 1-312');
  });

  it('expands a page range, normalising one typed backwards', () => {
    expect(selectedPages(selection({ mode: 'range', from: 4, to: 6 }))).toEqual([4, 5, 6]);
    expect(selectedPages(selection({ mode: 'range', from: 6, to: 4 }))).toEqual([4, 5, 6]);
    expect(contextLabel(selection({ mode: 'range', from: 4, to: 6 }))).toBe('pages 4-6 of 312');
  });

  it('clamps a range typed past the end of the document', () => {
    expect(selectedPages(selection({ mode: 'range', from: 311, to: 900 }))).toEqual([311, 312]);
    expect(selectedPages(selection({ mode: 'range', from: 0, to: 2 }))).toEqual([1, 2]);
  });

  it('sends just the page on screen in current-page mode', () => {
    expect(selectedPages(selection({ mode: 'current', currentPage: 47 }))).toEqual([47]);
    expect(contextLabel(selection({ mode: 'current', currentPage: 47 }))).toBe('page 47 of 312');
  });
});

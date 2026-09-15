/**
 * The attorney never sees Electron's IPC wrapper or a node errno code.
 */

import { describe, expect, it } from 'vitest';
import { plainError } from './combine-messages';

describe('plainError', () => {
  it('names the file that has gone missing', () => {
    const error = new Error(
      "Error invoking remote method 'ops:merge': Error: ENOENT: no such file or directory, open 'C:\\Matters\\Ashford\\Exhibit 4.pdf'"
    );
    expect(plainError(error)).toBe(
      'Could not find Exhibit 4.pdf. It may have been moved or renamed since it was added to the list.'
    );
  });

  it('strips the IPC wrapper off anything else', () => {
    const error = new Error(
      "Error invoking remote method 'ops:merge': Error: NotImplemented: ops:merge"
    );
    expect(plainError(error)).toBe('NotImplemented: ops:merge');
  });

  it('passes a plain message straight through', () => {
    expect(plainError(new Error('The combined document came back empty.'))).toBe(
      'The combined document came back empty.'
    );
  });

  it('copes with something thrown that is not an Error', () => {
    expect(plainError('merge exploded')).toBe('merge exploded');
  });
});

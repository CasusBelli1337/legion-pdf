import { describe, expect, it } from 'vitest';
import { formatOpenedAt, missingFileNotice } from './recent-copy';

describe('recent timestamps', () => {
  it('reads as a sortable local date and time', () => {
    // Built in local time so the assertion holds in any timezone.
    const when = new Date(2026, 7, 10, 14, 32);
    expect(formatOpenedAt(when.toISOString())).toBe('2026-08-10 14:32');
  });

  it('pads single digits so the column lines up', () => {
    const when = new Date(2026, 0, 5, 9, 4);
    expect(formatOpenedAt(when.toISOString())).toBe('2026-01-05 09:04');
  });

  it('says "unknown" rather than "Invalid Date" for a corrupt entry', () => {
    expect(formatOpenedAt('not a date')).toBe('unknown');
  });
});

describe('the missing-file notice', () => {
  it('names the file and says it has left the list', () => {
    expect(missingFileNotice('Exhibit A.pdf')).toBe(
      'Librarius could not open Exhibit A.pdf. It may have been moved, renamed, or deleted, ' +
        'so it has been taken off this list.'
    );
  });
});

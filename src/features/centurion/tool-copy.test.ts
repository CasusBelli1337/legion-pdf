import { describe, expect, it } from 'vitest';
import { TOOL_TITLES, detailLines, formatPageList } from './tool-copy';

describe('the page line on a card', () => {
  it('collapses runs the way a page range is written', () => {
    expect(formatPageList(undefined)).toBe('Every page');
    expect(formatPageList([])).toBe('No pages');
    expect(formatPageList([7])).toBe('7');
    expect(formatPageList([1, 2, 3, 4])).toBe('1-4');
    expect(formatPageList([1, 2, 3, 9, 11, 12])).toBe('1-3, 9, 11-12');
  });
});

describe('the expandable detail', () => {
  it('reads as settings, not as JSON', () => {
    const lines = detailLines('applyBates', {
      prefix: 'PLAINTIFF',
      startNumber: 1,
      padWidth: 6,
      position: 'bottom-right',
      pages: [1, 2, 3],
    });
    expect(lines).toEqual([
      { label: 'First number', value: 'PLAINTIFF000001' },
      { label: 'Prefix', value: 'PLAINTIFF' },
      { label: 'Position', value: 'Bottom right' },
      { label: 'Pages', value: '1-3' },
    ]);
  });

  it('spells out an empty prefix rather than showing a blank', () => {
    const lines = detailLines('applyBates', {
      prefix: '',
      startNumber: 5,
      padWidth: 4,
      position: 'top-left',
    });
    expect(lines[0]).toEqual({ label: 'First number', value: '0005' });
    expect(lines[1]).toEqual({ label: 'Prefix', value: 'None' });
    expect(lines[3]).toEqual({ label: 'Pages', value: 'Every page' });
  });

  it('describes a watermark in words, not in decimals', () => {
    expect(
      detailLines('applyWatermark', {
        text: 'CONFIDENTIAL',
        orientation: 'diagonal',
        opacityPct: 25,
      })
    ).toEqual([
      { label: 'Text', value: 'CONFIDENTIAL' },
      { label: 'Direction', value: 'Diagonal' },
      { label: 'Strength', value: '25% (the page stays readable)' },
      { label: 'Pages', value: 'Every page' },
    ]);
  });

  it('lists a bookmark tree and a redaction term list one entry per line', () => {
    expect(
      detailLines('setBookmarks', {
        bookmarks: [
          { title: 'Exhibits', page: 2, children: [{ title: 'Exhibit A', page: 3 }] },
          { title: 'Declaration', page: 40 },
        ],
      })
    ).toEqual([
      { label: 'Exhibits', value: 'page 2 (+1 under it)' },
      { label: 'Declaration', value: 'page 40' },
    ]);

    expect(
      detailLines('suggestRedactions', {
        terms: [{ text: '123-45-6789', reason: 'Social security number' }],
      })
    ).toEqual([{ label: 'Social security number', value: '123-45-6789' }]);
  });

  // A card is only ever built from input main already validated, so a failure
  // here is a bug worth seeing rather than an empty panel.
  it('says so when the settings cannot be read', () => {
    const lines = detailLines('applyBates', { prefix: 7 });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.label).toBe('Could not read the settings');
  });

  it('lists one line per signature field, capped with an "and N more"', () => {
    const signers = [
      { name: 'Jane Smith', email: 'jane@example.com' },
      { name: 'John Doe', email: 'john@example.com' },
    ];
    expect(
      detailLines('addSignatureFields', {
        signers,
        fields: [
          {
            kind: 'signature',
            signerEmail: 'jane@example.com',
            page: 4,
            anchorText: 'By:',
            placement: 'right-of',
          },
        ],
      })
    ).toEqual([{ label: 'Signature', value: 'Jane Smith, p. 4, right of "By:"' }]);

    const many = Array.from({ length: 10 }, (_unused, index) => ({
      kind: 'date',
      signerEmail: 'john@example.com',
      page: index + 1,
      anchorText: 'Date:',
      placement: 'below',
    }));
    const lines = detailLines('addSignatureFields', { signers, fields: many });
    expect(lines).toHaveLength(9);
    expect(lines[0]).toEqual({ label: 'Date', value: 'John Doe, p. 1, below "Date:"' });
    expect(lines[8]).toEqual({ label: '…', value: 'and 2 more fields' });
  });

  it('names every tool in the words the panels use', () => {
    expect(Object.values(TOOL_TITLES)).toEqual([
      'Bates numbering',
      'Watermark',
      'Exhibit stamp',
      'Page numbers',
      'Bookmarks',
      'Suggested redactions',
      'Add e-signature fields',
    ]);
  });
});

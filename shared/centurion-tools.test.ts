import { describe, expect, it } from 'vitest';
import {
  CenturionToolInputError,
  detailOf,
  isToolName,
  validateToolCall,
  verdictOf,
} from './centurion-tools';

/** The exact shape a good call has, per tool — the "yes" half of every case. */
const GOOD: Record<string, unknown> = {
  applyBates: { prefix: 'PLAINTIFF', startNumber: 1, padWidth: 6, position: 'bottom-right' },
  applyWatermark: { text: 'CONFIDENTIAL', orientation: 'diagonal', opacityPct: 25 },
  applyExhibitStamp: { label: 'EXHIBIT A', position: 'bottom-center', pages: [3] },
  applyPageNumbers: { position: 'bottom-center' },
  setBookmarks: { bookmarks: [{ title: 'Exhibit A', page: 3 }] },
  suggestRedactions: { terms: [{ text: '123-45-6789', reason: 'Social security number' }] },
  addSignatureFields: {
    signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
    fields: [
      {
        kind: 'signature',
        signerEmail: 'jane@example.com',
        page: 4,
        anchorText: 'By:',
        placement: 'right-of',
      },
    ],
  },
};

describe('the tool catalogue', () => {
  it('narrows the good shape of every tool Centurion can be offered', () => {
    expect(Object.keys(GOOD)).toEqual([
      'applyBates',
      'applyWatermark',
      'applyExhibitStamp',
      'applyPageNumbers',
      'setBookmarks',
      'suggestRedactions',
      'addSignatureFields',
    ]);
    for (const [name, input] of Object.entries(GOOD)) {
      expect(isToolName(name)).toBe(true);
      expect(validateToolCall(name, input).name).toBe(name);
    }
  });

  it('refuses a tool it never offered', () => {
    expect(() => validateToolCall('deleteEverything', {})).toThrow(CenturionToolInputError);
    expect(isToolName('deleteEverything')).toBe(false);
  });

  it('refuses input that is not an object at all', () => {
    for (const input of [null, undefined, 'PLAINTIFF', 42, ['a']]) {
      expect(() => validateToolCall('applyBates', input)).toThrow(CenturionToolInputError);
    }
  });
});

describe('applyBates', () => {
  it('takes a full, well-formed call', () => {
    const call = validateToolCall('applyBates', {
      ...(GOOD['applyBates'] as object),
      pages: [3, 1, 1, 2],
    });
    expect(call).toEqual({
      name: 'applyBates',
      input: {
        prefix: 'PLAINTIFF',
        startNumber: 1,
        padWidth: 6,
        position: 'bottom-right',
        pages: [1, 2, 3],
      },
    });
  });

  it('allows an empty prefix but not a missing one', () => {
    const call = validateToolCall('applyBates', { ...(GOOD['applyBates'] as object), prefix: '' });
    expect(call.input).toMatchObject({ prefix: '' });
    expect(() =>
      validateToolCall('applyBates', { ...(GOOD['applyBates'] as object), prefix: 7 })
    ).toThrow(/must be text/);
  });

  it('rejects the numbers a stamp cannot be made from', () => {
    const base = GOOD['applyBates'] as object;
    expect(() => validateToolCall('applyBates', { ...base, startNumber: -1 })).toThrow(/between/);
    expect(() => validateToolCall('applyBates', { ...base, startNumber: 1.5 })).toThrow(/whole/);
    expect(() => validateToolCall('applyBates', { ...base, padWidth: 40 })).toThrow(
      /between 0 and 12/
    );
  });

  it('rejects a corner that is not a corner', () => {
    const base = GOOD['applyBates'] as object;
    expect(() => validateToolCall('applyBates', { ...base, position: 'middle' })).toThrow(
      /top-left, top-right/
    );
    // Exhibit stamps may sit on the bottom edge; Bates numbers may not.
    expect(() => validateToolCall('applyBates', { ...base, position: 'bottom-center' })).toThrow();
  });

  it('rejects page numbers that are not page numbers', () => {
    const base = GOOD['applyBates'] as object;
    for (const pages of [[], [0], [-2], [1.5], ['3'], 'all']) {
      expect(() => validateToolCall('applyBates', { ...base, pages })).toThrow(
        CenturionToolInputError
      );
    }
  });

  it('treats an omitted page list as the whole document, not as no pages', () => {
    const call = validateToolCall('applyBates', GOOD['applyBates']);
    expect('pages' in call.input).toBe(false);
    expect(
      validateToolCall('applyBates', { ...(GOOD['applyBates'] as object), pages: null }).input
    ).not.toHaveProperty('pages');
  });
});

describe('applyWatermark', () => {
  it('takes text, direction, and a strength inside 1-100', () => {
    expect(validateToolCall('applyWatermark', GOOD['applyWatermark']).input).toEqual({
      text: 'CONFIDENTIAL',
      orientation: 'diagonal',
      opacityPct: 25,
    });
  });

  it('rejects an invisible or opaque watermark, and an unnamed one', () => {
    const base = GOOD['applyWatermark'] as object;
    expect(() => validateToolCall('applyWatermark', { ...base, opacityPct: 0 })).toThrow(
      /between 1 and 100/
    );
    expect(() => validateToolCall('applyWatermark', { ...base, opacityPct: 140 })).toThrow(
      /between/
    );
    expect(() => validateToolCall('applyWatermark', { ...base, text: '   ' })).toThrow(/some text/);
    expect(() => validateToolCall('applyWatermark', { ...base, orientation: 'sideways' })).toThrow(
      /diagonal, horizontal/
    );
  });
});

describe('applyExhibitStamp', () => {
  it('requires the pages, because an exhibit label is not a whole-document stamp', () => {
    expect(() =>
      validateToolCall('applyExhibitStamp', { label: 'EXHIBIT A', position: 'bottom-right' })
    ).toThrow(/at least one page/);
  });

  it('takes the bottom edge as well as the four corners', () => {
    expect(validateToolCall('applyExhibitStamp', GOOD['applyExhibitStamp']).input).toEqual({
      label: 'EXHIBIT A',
      position: 'bottom-center',
      pages: [3],
    });
  });

  it('rejects a label longer than a stamp can carry', () => {
    expect(() =>
      validateToolCall('applyExhibitStamp', {
        ...(GOOD['applyExhibitStamp'] as object),
        label: 'E'.repeat(120),
      })
    ).toThrow(/at most 64/);
  });
});

describe('applyPageNumbers', () => {
  it('takes any of the six header and footer spots', () => {
    for (const position of ['top-left', 'top-center', 'bottom-right'] as const) {
      expect(validateToolCall('applyPageNumbers', { position }).input).toEqual({ position });
    }
  });

  it('rejects a spot that does not exist', () => {
    expect(() => validateToolCall('applyPageNumbers', { position: 'middle-center' })).toThrow(
      CenturionToolInputError
    );
  });
});

describe('setBookmarks', () => {
  it('takes a nested tree', () => {
    const call = validateToolCall('setBookmarks', {
      bookmarks: [
        { title: 'Exhibits', page: 2, children: [{ title: 'Exhibit A', page: 3 }] },
        { title: 'Declaration', page: 40 },
      ],
    });
    expect(call.input).toEqual({
      bookmarks: [
        { title: 'Exhibits', page: 2, children: [{ title: 'Exhibit A', page: 3 }] },
        { title: 'Declaration', page: 40 },
      ],
    });
  });

  it('refuses an empty outline, an untitled entry, and a bookmark with no page', () => {
    expect(() => validateToolCall('setBookmarks', { bookmarks: [] })).toThrow(/at least one/);
    expect(() => validateToolCall('setBookmarks', { bookmarks: [{ title: '', page: 1 }] })).toThrow(
      /some text/
    );
    expect(() => validateToolCall('setBookmarks', { bookmarks: [{ title: 'A' }] })).toThrow(
      /whole number/
    );
    expect(() =>
      validateToolCall('setBookmarks', { bookmarks: [{ title: 'A', page: 0 }] })
    ).toThrow(/between 1/);
  });

  it('refuses a tree too deep or too large to be a real outline', () => {
    const deep = {
      title: 'A',
      page: 1,
      children: [
        {
          title: 'B',
          page: 1,
          children: [
            {
              title: 'C',
              page: 1,
              children: [{ title: 'D', page: 1, children: [{ title: 'E', page: 1 }] }],
            },
          ],
        },
      ],
    };
    expect(() => validateToolCall('setBookmarks', { bookmarks: [deep] })).toThrow(/too large/);
    const wide = Array.from({ length: 501 }, (_unused, index) => ({ title: `A${index}`, page: 1 }));
    expect(() => validateToolCall('setBookmarks', { bookmarks: wide })).toThrow(/too large/);
  });
});

describe('suggestRedactions', () => {
  it('takes each term with the reason it should go', () => {
    expect(validateToolCall('suggestRedactions', GOOD['suggestRedactions']).input).toEqual({
      terms: [{ text: '123-45-6789', reason: 'Social security number' }],
    });
  });

  it('refuses a term with no text and a term with no reason', () => {
    expect(() => validateToolCall('suggestRedactions', { terms: [] })).toThrow(/at least one/);
    expect(() =>
      validateToolCall('suggestRedactions', { terms: [{ text: '', reason: 'PII' }] })
    ).toThrow(/some text/);
    expect(() =>
      validateToolCall('suggestRedactions', { terms: [{ text: '123-45-6789' }] })
    ).toThrow(/"reason"/);
  });
});

describe('addSignatureFields', () => {
  const jane = { name: 'Jane Smith', email: 'jane@example.com' };
  const signatureFor = (signerEmail: string): Record<string, unknown> => ({
    kind: 'signature',
    signerEmail,
    page: 1,
    anchorText: 'By:',
    placement: 'on',
  });

  it('takes a full call, keeping the optional occurrence and label only when given', () => {
    const call = validateToolCall('addSignatureFields', {
      signers: [jane],
      fields: [
        { ...signatureFor('jane@example.com'), occurrence: 2 },
        {
          kind: 'text',
          signerEmail: 'jane@example.com',
          page: 2,
          anchorText: 'Title:',
          placement: 'right-of',
          label: 'Title',
        },
      ],
    });
    expect(call).toEqual({
      name: 'addSignatureFields',
      input: {
        signers: [jane],
        fields: [
          {
            kind: 'signature',
            signerEmail: 'jane@example.com',
            page: 1,
            anchorText: 'By:',
            placement: 'on',
            occurrence: 2,
          },
          {
            kind: 'text',
            signerEmail: 'jane@example.com',
            page: 2,
            anchorText: 'Title:',
            placement: 'right-of',
            label: 'Title',
          },
        ],
      },
    });
    const bare = validateToolCall('addSignatureFields', GOOD['addSignatureFields']);
    expect(bare.name).toBe('addSignatureFields');
    if (bare.name === 'addSignatureFields') {
      expect('occurrence' in (bare.input.fields[0] ?? {})).toBe(false);
      expect('label' in (bare.input.fields[0] ?? {})).toBe(false);
    }
  });

  it('refuses a field whose signerEmail matches nobody on the roster', () => {
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [signatureFor('john@example.com')],
      })
    ).toThrow(/matches nobody in "signers"/);
  });

  it('refuses an email address without an @, on the roster and on a field', () => {
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [{ name: 'Jane Smith', email: 'not-an-email' }],
        fields: [signatureFor('not-an-email')],
      })
    ).toThrow(/must be an email address/);
  });

  it('refuses an empty roster, an empty field list, and oversized ones', () => {
    expect(() =>
      validateToolCall('addSignatureFields', { signers: [], fields: [signatureFor(jane.email)] })
    ).toThrow(/at least one signer/);
    expect(() => validateToolCall('addSignatureFields', { signers: [jane], fields: [] })).toThrow(
      /at least one field/
    );
    const crowd = Array.from({ length: 21 }, (_unused, index) => ({
      name: `Signer ${index}`,
      email: `signer${index}@example.com`,
    }));
    expect(() =>
      validateToolCall('addSignatureFields', { signers: crowd, fields: [signatureFor(jane.email)] })
    ).toThrow(/at most 20 signers/);
    const flood = Array.from({ length: 101 }, () => signatureFor(jane.email));
    expect(() =>
      validateToolCall('addSignatureFields', { signers: [jane], fields: flood })
    ).toThrow(/at most 100 fields/);
  });

  it('refuses a kind or placement it never offered', () => {
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [{ ...signatureFor(jane.email), kind: 'stamp' }],
      })
    ).toThrow(/signature, initials, name, date, text/);
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [{ ...signatureFor(jane.email), placement: 'left-of' }],
      })
    ).toThrow(/right-of, above, below, on/);
  });

  it('refuses an empty anchor, a zero page, and a zero occurrence', () => {
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [{ ...signatureFor(jane.email), anchorText: '   ' }],
      })
    ).toThrow(/"anchorText" must be some text/);
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [{ ...signatureFor(jane.email), page: 0 }],
      })
    ).toThrow(/"page" must be between 1/);
    expect(() =>
      validateToolCall('addSignatureFields', {
        signers: [jane],
        fields: [{ ...signatureFor(jane.email), occurrence: 0 }],
      })
    ).toThrow(/"occurrence" must be between 1 and 50/);
  });
});

describe('the attorney answer', () => {
  it('reads a bare verdict and a verdict with a receipt the same way', () => {
    expect(verdictOf('approved')).toBe('approved');
    expect(verdictOf('rejected')).toBe('rejected');
    expect(verdictOf({ verdict: 'approved', detail: 'Marked 12 instances.' })).toBe('approved');
    expect(detailOf('approved')).toBeUndefined();
    expect(detailOf({ verdict: 'approved', detail: 'Marked 12 instances.' })).toBe(
      'Marked 12 instances.'
    );
  });
});

import { describe, expect, it } from 'vitest';
import { makeTestPdf } from '@core/ops/test-fixtures';
import { rebuildWithImagePages } from './image-pages';
import { fakePageRaster } from './raster.testkit';
import { RedactionNotVerifiedError } from './types';
import { assertVerified, censusOf, verifyRedaction } from './verify';
import type { VerifyTarget } from './verify';

const SECRET = 'SSN 545-45-6789';
const SURVIVOR = 'MUST-SURVIVE-REDACTION';

function raster(page: number, width = 200, height = 300) {
  const built = fakePageRaster({ crop: { x: 0, y: 0, width, height }, dpi: 72 });
  return { page, png: built.png, widthPx: built.widthPx, heightPx: built.heightPx };
}

/** The census the real pipeline builds: what the source held, what was marked. */
function marked(source: Uint8Array, text: string, instances: number): VerifyTarget[] {
  return censusOf(source, [text], new Map([[text.toLowerCase(), instances]]));
}

/** A term nobody marked: the caller demands it be absent outright. */
function mustBeAbsent(text: string): VerifyTarget[] {
  return [{ text, occurrencesBefore: 0, markedInstances: 0 }];
}

/** The secret sits on BOTH pages, so redacting one leaves an unmarked copy. */
async function secretOnBothPages(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: [
      { label: SECRET, width: 200, height: 300 },
      { label: SECRET, width: 200, height: 300 },
    ],
  });
}

describe('censusOf', () => {
  it('counts what the source held and how much of it was marked', async () => {
    const source = await secretOnBothPages();
    expect(marked(source, SECRET, 1)).toEqual([
      { text: SECRET, occurrencesBefore: 2, markedInstances: 1 },
    ]);
  });

  it('matches the marked count case-insensitively, as the store keys it', async () => {
    const source = await secretOnBothPages();
    const targets = censusOf(source, [SECRET], new Map([['ssn 545-45-6789', 2]]));
    expect(targets[0]?.markedInstances).toBe(2);
  });

  it('reports zero marked instances for a term the caller only listed', async () => {
    const source = await secretOnBothPages();
    expect(censusOf(source, [SECRET], new Map())[0]?.markedInstances).toBe(0);
  });
});

describe('verifyRedaction', () => {
  it('certifies a document whose marked page really was rebuilt', async () => {
    const source = await makeTestPdf({
      pages: [{ label: SECRET, width: 200, height: 300 }, { label: SURVIVOR }],
    });
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: marked(source, SECRET, 1),
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result).toEqual({
      verified: true,
      pagesRebuilt: [1],
      instancesDestroyed: 1,
      survivingStrings: [],
      pagesStillCarryingText: [],
      terms: [{ text: SECRET, before: 1, remaining: 0, marked: 1 }],
    });
  });

  /**
   * QA F-1, the bug this file exists to keep fixed. Marking ONE instance of a
   * term that appears twice is a complete, correct redaction: the attorney
   * asked for that copy and got it. Failing the run over the copy on page 2
   * told them their marked text had survived, which was never true.
   */
  it('SUCCEEDS when one of two instances was marked, and counts the one left standing', async () => {
    const source = await secretOnBothPages();
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: marked(source, SECRET, 1),
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(true);
    expect(result.survivingStrings).toEqual([]);
    expect(result.terms).toEqual([{ text: SECRET, before: 2, remaining: 1, marked: 1 }]);
    expect(() => assertVerified(result)).not.toThrow();
  });

  it('still demands total absence when every instance was marked', async () => {
    const source = await secretOnBothPages();
    const rebuilt = await rebuildWithImagePages(source, [raster(1), raster(2)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: marked(source, SECRET, 2),
      pagesRebuilt: [1, 2],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 2,
    });
    expect(result.verified).toBe(true);
    expect(result.terms).toEqual([{ text: SECRET, before: 2, remaining: 0, marked: 2 }]);
  });

  /**
   * The genuine survivor: two instances marked, only one destroyed. This is the
   * failure the whole feature exists to catch, and instance scoping must not
   * soften it — one copy the attorney marked is still readable.
   */
  it('FAILS LOUDLY when a marked instance was left readable', async () => {
    const source = await secretOnBothPages();
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: marked(source, SECRET, 2),
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 2,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([SECRET]);
    expect(result.terms).toEqual([{ text: SECRET, before: 2, remaining: 1, marked: 2 }]);
    expect(() => assertVerified(result)).toThrow(RedactionNotVerifiedError);
  });

  it('fails a term nobody marked but the caller asked to prove absent', async () => {
    const source = await makeTestPdf({ pages: [{ label: SECRET, width: 200, height: 300 }] });
    const result = await verifyRedaction({
      bytes: source,
      targets: mustBeAbsent(SECRET),
      pagesRebuilt: [],
      expectNoTextOnRebuiltPages: false,
      instancesDestroyed: 0,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([SECRET]);
  });

  /**
   * A term drawn glyph by glyph is invisible to a byte scan, so its source count
   * is zero and there is nothing to subtract. Counting must not fail it for not
   * shrinking — but it must still fail if the term turns up in the output.
   */
  it('falls back to plain absence for a term the byte scan never saw', async () => {
    const source = await makeTestPdf({ pages: [{ label: SECRET, width: 200, height: 300 }] });
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const unseen: VerifyTarget[] = [{ text: SECRET, occurrencesBefore: 0, markedInstances: 1 }];
    const clean = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: unseen,
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(clean.verified).toBe(true);

    const dirty = await verifyRedaction({
      bytes: source,
      targets: unseen,
      pagesRebuilt: [],
      expectNoTextOnRebuiltPages: false,
      instancesDestroyed: 1,
    });
    expect(dirty.survivingStrings).toEqual([SECRET]);
  });

  it('counts a marked term stored as UTF-16BE hex in a bookmark title', async () => {
    const source = await makeTestPdf({
      pages: [{ label: 'PUBLIC', width: 200, height: 300 }],
      bookmarks: [{ title: `Account ${SECRET}`, page: 1, children: [] }],
    });
    const targets = marked(source, SECRET, 1);
    expect(targets[0]?.occurrencesBefore).toBe(1);
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets,
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(true);
    expect(result.terms).toEqual([{ text: SECRET, before: 1, remaining: 0, marked: 1 }]);
  });

  it('counts a marked term stored in the document information dictionary', async () => {
    const source = await makeTestPdf({
      pages: [{ label: 'PUBLIC', width: 200, height: 300 }],
      info: { Author: SECRET },
    });
    const targets = marked(source, SECRET, 1);
    expect(targets[0]?.occurrencesBefore).toBe(1);
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets,
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(true);
  });

  it('fails when a page that should be an image still draws text', async () => {
    const source = await makeTestPdf({ pages: [{ label: SURVIVOR }] });
    const result = await verifyRedaction({
      bytes: source,
      targets: [],
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(false);
    // A page that was not really rebuilt is its OWN failure, never smuggled
    // into survivingStrings as a sentence.
    expect(result.pagesStillCarryingText).toEqual([1]);
    expect(result.survivingStrings).toEqual([]);
    expect(() => assertVerified(result)).toThrow(RedactionNotVerifiedError);
  });

  it('names the page in the loud failure', async () => {
    const source = await makeTestPdf({ pages: [{ label: SURVIVOR }, { label: SURVIVOR }] });
    const result = await verifyRedaction({
      bytes: source,
      targets: [],
      pagesRebuilt: [1, 2],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 2,
    });
    expect(result.pagesStillCarryingText).toEqual([1, 2]);
    expect(() => assertVerified(result)).toThrow(/pages 1, 2 still draw text/);
  });

  /**
   * The re-OCR pass runs with the page-silence gate switched off, because a
   * text layer was deliberately written back on. The count check is what carries
   * it: a marked copy that came back through OCR never disappeared.
   */
  it('catches a marked copy resurrected by re-OCR, with page silence switched off', async () => {
    const source = await secretOnBothPages();
    const result = await verifyRedaction({
      bytes: source,
      targets: marked(source, SECRET, 1),
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: false,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([SECRET]);
    expect(result.terms).toEqual([{ text: SECRET, before: 2, remaining: 2, marked: 1 }]);
  });

  it('passes the re-OCR pass when only the unmarked copy came back', async () => {
    const source = await secretOnBothPages();
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      targets: marked(source, SECRET, 1),
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: false,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(true);
    expect(result.terms).toEqual([{ text: SECRET, before: 2, remaining: 1, marked: 1 }]);
  });

  it('reports every failing term rather than stopping at the first', async () => {
    const source = await makeTestPdf({
      pages: [{ label: `${SECRET} and ACCT-99887766`, width: 400, height: 300 }],
    });
    const result = await verifyRedaction({
      bytes: source,
      targets: [...mustBeAbsent(SECRET), ...mustBeAbsent('ACCT-99887766')],
      pagesRebuilt: [],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 0,
    });
    expect(result.survivingStrings).toEqual([SECRET, 'ACCT-99887766']);
  });

  it('refuses to certify a redaction it was given nothing to check', async () => {
    const source = await makeTestPdf({ pages: [{ label: SURVIVOR }] });
    await expect(
      verifyRedaction({
        bytes: source,
        targets: [],
        pagesRebuilt: [],
        expectNoTextOnRebuiltPages: true,
        instancesDestroyed: 0,
      })
    ).rejects.toThrow(/refusing to certify a redaction it did not check/);
  });

  it('refuses to certify an empty document', async () => {
    await expect(
      verifyRedaction({
        bytes: new Uint8Array(0),
        targets: mustBeAbsent(SECRET),
        pagesRebuilt: [1],
        expectNoTextOnRebuiltPages: true,
        instancesDestroyed: 1,
      })
    ).rejects.toThrow(/empty document/);
  });

  it('refuses a claim that a page outside the document was rebuilt', async () => {
    const source = await makeTestPdf({ pages: [{ label: SURVIVOR }] });
    await expect(
      verifyRedaction({
        bytes: source,
        targets: mustBeAbsent(SECRET),
        pagesRebuilt: [7],
        expectNoTextOnRebuiltPages: true,
        instancesDestroyed: 1,
      })
    ).rejects.toThrow(RangeError);
  });
});

describe('assertVerified', () => {
  const RECEIPT = {
    verified: true,
    pagesRebuilt: [1],
    instancesDestroyed: 1,
    survivingStrings: [],
    terms: [],
  };

  it('passes a clean receipt straight through', () => {
    expect(() => assertVerified(RECEIPT)).not.toThrow();
  });

  it('passes a receipt that reports unmarked copies still in the document', () => {
    expect(() =>
      assertVerified({
        ...RECEIPT,
        terms: [{ text: SECRET, before: 5, remaining: 3, marked: 2 }],
      })
    ).not.toThrow();
  });

  it('names the failure as the MARKED copies surviving, never the term itself', () => {
    expect(() =>
      assertVerified({ ...RECEIPT, verified: false, survivingStrings: [SECRET] })
    ).toThrow(/the marked copies of 1 term are still readable/);
  });

  // `verified` is one flag over two failure lists. Trusting it alone is how a
  // receipt that says "true" beside a non-empty failure list ships a leak.
  it('refuses a receipt that claims success beside surviving text', () => {
    expect(() =>
      assertVerified({ ...RECEIPT, survivingStrings: [SECRET], pagesStillCarryingText: [] })
    ).toThrow(RedactionNotVerifiedError);
  });

  it('refuses a receipt that claims success beside a page still drawing text', () => {
    expect(() => assertVerified({ ...RECEIPT, pagesStillCarryingText: [1] })).toThrow(
      /page 1 still draws text/
    );
  });

  it('reports both failure kinds together when both happened', () => {
    expect(() =>
      assertVerified({
        ...RECEIPT,
        verified: false,
        pagesRebuilt: [1, 2],
        instancesDestroyed: 2,
        survivingStrings: [SECRET],
        pagesStillCarryingText: [2],
      })
    ).toThrow(/still readable and page 2 still draws text/);
  });
});

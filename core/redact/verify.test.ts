import { describe, expect, it } from 'vitest';
import { makeTestPdf } from '@core/ops/test-fixtures';
import { rebuildWithImagePages } from './image-pages';
import { fakePageRaster } from './raster.testkit';
import { RedactionNotVerifiedError } from './types';
import { assertVerified, textOnPageMarker, verifyRedaction } from './verify';

const SECRET = 'SSN 545-45-6789';
const SURVIVOR = 'MUST-SURVIVE-REDACTION';

function raster(page: number, width = 200, height = 300) {
  const built = fakePageRaster({ crop: { x: 0, y: 0, width, height }, dpi: 72 });
  return { page, png: built.png, widthPx: built.widthPx, heightPx: built.heightPx };
}

/** The secret sits on BOTH pages, so redacting only one leaves a survivor. */
async function secretOnBothPages(): Promise<Uint8Array> {
  return makeTestPdf({
    pages: [
      { label: SECRET, width: 200, height: 300 },
      { label: SECRET, width: 200, height: 300 },
    ],
  });
}

describe('verifyRedaction', () => {
  it('certifies a document whose marked page really was rebuilt', async () => {
    const source = await makeTestPdf({
      pages: [{ label: SECRET, width: 200, height: 300 }, { label: SURVIVOR }],
    });
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      strings: [SECRET],
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result).toEqual({
      verified: true,
      pagesRebuilt: [1],
      instancesDestroyed: 1,
      survivingStrings: [],
    });
  });

  it('FAILS LOUDLY when a marked string survives on a page that was not burned', async () => {
    // The failure the whole feature exists to catch: page 2 was never marked,
    // so its copy of the secret is still in the file.
    const source = await secretOnBothPages();
    const rebuilt = await rebuildWithImagePages(source, [raster(1)], [SECRET]);
    const result = await verifyRedaction({
      bytes: rebuilt.bytes,
      strings: [SECRET],
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([SECRET]);
    expect(() => assertVerified(result)).toThrow(RedactionNotVerifiedError);
  });

  it('fails when a page that should be an image still draws text', async () => {
    const source = await makeTestPdf({ pages: [{ label: SURVIVOR }] });
    const result = await verifyRedaction({
      bytes: source,
      strings: [],
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: true,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([textOnPageMarker(1)]);
  });

  it('searches the fresh text layer instead when re-OCR was asked for', async () => {
    const source = await makeTestPdf({ pages: [{ label: SECRET, width: 200, height: 300 }] });
    const result = await verifyRedaction({
      bytes: source,
      strings: [SECRET],
      pagesRebuilt: [1],
      expectNoTextOnRebuiltPages: false,
      instancesDestroyed: 1,
    });
    expect(result.verified).toBe(false);
    expect(result.survivingStrings).toEqual([SECRET]);
  });

  it('reports every survivor rather than stopping at the first', async () => {
    const source = await makeTestPdf({
      pages: [{ label: `${SECRET} and ACCT-99887766`, width: 400, height: 300 }],
    });
    const result = await verifyRedaction({
      bytes: source,
      strings: [SECRET, 'ACCT-99887766'],
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
        strings: [],
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
        strings: [SECRET],
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
        strings: [SECRET],
        pagesRebuilt: [7],
        expectNoTextOnRebuiltPages: true,
        instancesDestroyed: 1,
      })
    ).rejects.toThrow(RangeError);
  });
});

describe('assertVerified', () => {
  it('passes a clean receipt straight through', () => {
    expect(() =>
      assertVerified({
        verified: true,
        pagesRebuilt: [1],
        instancesDestroyed: 1,
        survivingStrings: [],
      })
    ).not.toThrow();
  });

  it('names the count of survivors in plain English', () => {
    expect(() =>
      assertVerified({
        verified: false,
        pagesRebuilt: [1],
        instancesDestroyed: 1,
        survivingStrings: [SECRET],
      })
    ).toThrow(/1 marked item is still readable/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfRect, SignatureToolField, TextMatch } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import {
  applySignatureFields,
  placeRelative,
  resolveAnchors,
  unionQuads,
} from './anchor-placement';
import { useEsignStore } from './request-store';

const DOC = 'doc-1';
const PAGE = { width: 612, height: 792 };

function match(page: number, quads: PdfRect[], index = 0): TextMatch {
  return { page, text: 'anchor', index, quads };
}

/** Only the members the placement path uses; the rest of the viewer is not its business. */
function fakeViewer(hits: Record<string, TextMatch[]>, calls: string[] = []): ViewerApi {
  return {
    docId: DOC,
    pageSize: () => PAGE,
    findText: (query: string) => {
      calls.push(query);
      return Promise.resolve(hits[query] ?? []);
    },
  } as unknown as ViewerApi;
}

function field(overrides: Partial<SignatureToolField>): SignatureToolField {
  return {
    kind: 'signature',
    signerEmail: 'jane@example.com',
    page: 1,
    anchorText: 'By:',
    placement: 'on',
    ...overrides,
  };
}

beforeEach(() => {
  useEsignStore.setState({
    signers: [],
    fields: [],
    sent: [],
    selectedFieldId: null,
    placing: null,
  });
});

describe('placeRelative', () => {
  const anchor: PdfRect = { x: 100, y: 700, width: 40, height: 12 };

  it('puts a right-of box on the same line, vertically centred on the anchor', () => {
    expect(placeRelative(anchor, 'date', 'right-of', PAGE)).toEqual({
      x: 146, // anchor right edge + 6pt gap
      y: 696, // centred on the anchor's 12pt line
      width: 100,
      height: 20,
    });
  });

  it('centres an on box over the anchor, covering it', () => {
    const line: PdfRect = { x: 200, y: 300, width: 120, height: 14 };
    expect(placeRelative(line, 'signature', 'on', PAGE)).toEqual({
      x: 170,
      y: 287,
      width: 180,
      height: 40,
    });
  });

  it('stacks below and above with a 4pt gap, left-aligned with the anchor', () => {
    const line: PdfRect = { x: 72, y: 500, width: 100, height: 12 };
    expect(placeRelative(line, 'initials', 'below', PAGE)).toEqual({
      x: 72,
      y: 464, // 500 - 4 - 32
      width: 64,
      height: 32,
    });
    expect(placeRelative(line, 'initials', 'above', PAGE)).toEqual({
      x: 72,
      y: 516, // 500 + 12 + 4
      width: 64,
      height: 32,
    });
  });

  it('shifts a box back inside the page instead of shrinking it', () => {
    // Off the right edge: 580 + 20 + 6 = 606, but 612 - 100 leaves room only at 512.
    const nearRight = placeRelative(
      { x: 580, y: 700, width: 20, height: 12 },
      'date',
      'right-of',
      PAGE
    );
    expect(nearRight).toEqual({ x: 512, y: 696, width: 100, height: 20 });
    // Off the bottom edge.
    const nearBottom = placeRelative(
      { x: 72, y: 20, width: 50, height: 12 },
      'initials',
      'below',
      PAGE
    );
    expect(nearBottom).toEqual({ x: 72, y: 0, width: 64, height: 32 });
    // Off the top edge.
    const nearTop = placeRelative(
      { x: 72, y: 770, width: 100, height: 12 },
      'signature',
      'above',
      PAGE
    );
    expect(nearTop).toEqual({ x: 72, y: 752, width: 180, height: 40 });
    // Off the left edge, from centring a wide box on a narrow anchor.
    const nearLeft = placeRelative(
      { x: 5, y: 400, width: 20, height: 12 },
      'signature',
      'on',
      PAGE
    );
    expect(nearLeft.x).toBe(0);
  });
});

describe('unionQuads', () => {
  it('returns the one rectangle covering every quad', () => {
    expect(
      unionQuads([
        { x: 10, y: 10, width: 20, height: 10 },
        { x: 40, y: 5, width: 30, height: 10 },
      ])
    ).toEqual({ x: 10, y: 5, width: 60, height: 15 });
  });

  it('returns a single quad unchanged and refuses an empty list', () => {
    const quad: PdfRect = { x: 7, y: 8, width: 9, height: 10 };
    expect(unionQuads([quad])).toEqual(quad);
    expect(() => unionQuads([])).toThrow(/no quads/);
  });
});

describe('resolveAnchors', () => {
  it('searches once per distinct anchor text', async () => {
    const calls: string[] = [];
    const api = fakeViewer(
      { 'By:': [match(1, [{ x: 72, y: 100, width: 30, height: 12 }])] },
      calls
    );

    const { hits } = await resolveAnchors(api, [
      field({ anchorText: 'By:' }),
      field({ anchorText: 'By:', kind: 'date', placement: 'below' }),
    ]);

    expect(calls).toEqual(['By:']);
    expect(hits).toHaveLength(2);
  });

  it('filters to the field page and honours the occurrence, missing loudly past the end', async () => {
    const api = fakeViewer({
      'By:': [
        match(1, [{ x: 72, y: 700, width: 30, height: 12 }], 0),
        match(2, [{ x: 72, y: 700, width: 30, height: 12 }], 1),
        match(2, [{ x: 72, y: 300, width: 30, height: 12 }], 2),
      ],
    });

    const { hits, misses } = await resolveAnchors(api, [
      field({ anchorText: 'By:', page: 2, occurrence: 2, kind: 'date', placement: 'right-of' }),
      field({ anchorText: 'By:', page: 2, occurrence: 3 }),
      field({ anchorText: 'By:', page: 4 }),
    ]);

    // The second match ON PAGE 2, not the second match in the document.
    expect(hits).toHaveLength(1);
    expect(hits[0]?.rect).toEqual({ x: 108, y: 296, width: 100, height: 20 });
    expect(misses.map((miss) => miss.why)).toEqual([
      'Only 2 matches for "By:" on page 2, not 3',
      'No match for "By:" on page 4',
    ]);
  });
});

describe('applySignatureFields', () => {
  const signers = [
    { name: 'Jane Smith', email: 'jane@example.com' },
    { name: 'John Doe', email: 'john@example.com' },
  ];

  it('creates the signers, places every resolvable field, and reports honest counts', async () => {
    const api = fakeViewer({
      ________________: [match(1, [{ x: 100, y: 120, width: 200, height: 14 }])],
      'Date:': [match(1, [{ x: 72, y: 200, width: 30, height: 12 }])],
    });

    const receipt = await applySignatureFields(api, DOC, {
      signers,
      fields: [
        field({ anchorText: '________________', placement: 'on' }),
        field({
          kind: 'date',
          signerEmail: 'john@example.com',
          anchorText: 'Date:',
          placement: 'right-of',
        }),
      ],
    });

    expect(receipt).toBe('Added 2 fields for 2 signers to the E-Sign panel.');
    const state = useEsignStore.getState();
    expect(state.signers.map((signer) => [signer.docId, signer.name, signer.email])).toEqual([
      [DOC, 'Jane Smith', 'jane@example.com'],
      [DOC, 'John Doe', 'john@example.com'],
    ]);
    const jane = state.signers[0];
    const john = state.signers[1];
    expect(state.fields).toHaveLength(2);
    expect(state.fields[0]).toMatchObject({
      docId: DOC,
      kind: 'signature',
      signerId: jane?.id,
      page: 1,
      rect: { x: 110, y: 107, width: 180, height: 40 },
      required: true,
    });
    expect(state.fields[1]).toMatchObject({
      docId: DOC,
      kind: 'date',
      signerId: john?.id,
      rect: { x: 108, y: 196, width: 100, height: 20 },
      required: true,
    });
  });

  it('reuses a panel signer matched by email, case-insensitively and trimmed', async () => {
    const existingId = useEsignStore.getState().addSigner(DOC, 'Jane Smith', ' JANE@Example.com ');
    const api = fakeViewer({ 'By:': [match(1, [{ x: 72, y: 100, width: 30, height: 12 }])] });

    await applySignatureFields(api, DOC, {
      signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
      fields: [field({})],
    });

    const state = useEsignStore.getState();
    expect(state.signers).toHaveLength(1);
    expect(state.fields[0]?.signerId).toBe(existingId);
  });

  it('carries the label through to a text field', async () => {
    const api = fakeViewer({ 'Title:': [match(1, [{ x: 72, y: 100, width: 30, height: 12 }])] });

    await applySignatureFields(api, DOC, {
      signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
      fields: [
        field({ kind: 'text', anchorText: 'Title:', placement: 'right-of', label: 'Title' }),
      ],
    });

    expect(useEsignStore.getState().fields[0]).toMatchObject({ kind: 'text', label: 'Title' });
  });

  it('names what it could not find and never claims more than landed', async () => {
    const api = fakeViewer({ 'By:': [match(1, [{ x: 72, y: 100, width: 30, height: 12 }])] });

    const receipt = await applySignatureFields(api, DOC, {
      signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
      fields: [field({}), field({ kind: 'date', anchorText: 'Nowhere', page: 3 })],
    });

    expect(receipt).toBe(
      'Added 1 field for 1 signer to the E-Sign panel. Could not find: No match for "Nowhere" on page 3.'
    );
    expect(useEsignStore.getState().fields).toHaveLength(1);
  });

  it('says plainly when nothing landed at all', async () => {
    const receipt = await applySignatureFields(fakeViewer({}), DOC, {
      signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
      fields: [field({})],
    });

    expect(receipt).toBe(
      'No fields were added - no anchor was found. Could not find: No match for "By:" on page 1.'
    );
    expect(useEsignStore.getState().fields).toHaveLength(0);
  });
});

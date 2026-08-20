import { beforeEach, describe, expect, it } from 'vitest';
import type { HighlightOptions, TextMatch } from '@shared/types';
import { useRedactionStore } from '../redact/redaction-store';
import {
  copySelection,
  copySelectionWithCite,
  highlightReceipt,
  highlightSelection,
  liveActionDeps,
  redactSelection,
  textWithCite,
} from './menu-actions';
import type { SelectionActionDeps } from './menu-actions';
import type { SelectionPayload } from './engine';

interface RanOp {
  docId: string;
  label: string;
  receipt: string | null;
}

interface Recorded {
  deps: SelectionActionDeps;
  clipboard: string[];
  highlights: Array<{ docId: string; options: HighlightOptions }>;
  redactions: Array<{ docId: string; matches: readonly TextMatch[] }>;
  ops: RanOp[];
}

function recorder(overrides: Partial<SelectionActionDeps> = {}): Recorded {
  const clipboard: string[] = [];
  const highlights: Recorded['highlights'] = [];
  const redactions: Recorded['redactions'] = [];
  const ops: RanOp[] = [];
  return {
    clipboard,
    highlights,
    redactions,
    ops,
    deps: {
      writeText: (text) => {
        clipboard.push(text);
        return Promise.resolve();
      },
      highlight: (docId, options) => {
        highlights.push({ docId, options });
        return Promise.resolve(undefined);
      },
      markRedactions: (docId, matches) => {
        redactions.push({ docId, matches });
      },
      // Stands in for the real completion path: it runs the work and keeps the
      // receipt the footer would have shown.
      runOp: async (docId, label, work) => {
        const entry: RanOp = { docId, label, receipt: null };
        ops.push(entry);
        entry.receipt = await work();
      },
      ...overrides,
    },
  };
}

const PAYLOAD: SelectionPayload = {
  docId: 'doc-1',
  text: 'A. I did not read the whole document.',
  cite: { startPage: 3, startLine: 10, endPage: 3, endLine: 15, formatted: '(3:10-15)' },
  citeConfidence: 'high',
  pages: [
    {
      page: 5,
      text: 'A. I did not read the whole document.',
      quads: [
        { x: 90, y: 700, width: 200, height: 11 },
        { x: 90, y: 676, width: 180, height: 11 },
      ],
    },
    {
      page: 6,
      text: 'It continued onto the next page.',
      quads: [{ x: 90, y: 720, width: 160, height: 11 }],
    },
  ],
};

describe('copy', () => {
  it('copies the flowing text with no cite appended', async () => {
    const recorded = recorder();
    await copySelection(PAYLOAD, recorded.deps);

    expect(recorded.clipboard).toEqual(['A. I did not read the whole document.']);
  });

  it('appends the cite after a single space', async () => {
    const recorded = recorder();
    await copySelectionWithCite(PAYLOAD, recorded.deps);

    expect(recorded.clipboard).toEqual(['A. I did not read the whole document. (3:10-15)']);
  });

  it('copies the text unchanged when there is no cite to append', () => {
    expect(textWithCite({ ...PAYLOAD, cite: null })).toBe('A. I did not read the whole document.');
  });
});

describe('highlight', () => {
  it('calls the stamp channel once per page, with that page rectangles', async () => {
    const recorded = recorder();
    const pages = await highlightSelection(PAYLOAD, recorded.deps);

    expect(pages).toBe(2);
    expect(recorded.highlights.map((call) => call.options.page)).toEqual([5, 6]);
    expect(recorded.highlights[0]?.docId).toBe('doc-1');
    expect(recorded.highlights[0]?.options.rects).toHaveLength(2);
  });

  /**
   * F-2. The menu used to call `stamp.highlight` and walk away: the bytes
   * changed, the screen did not, the tab never went dirty, and closing it threw
   * the highlight away with no prompt. Every channel call must now sit INSIDE
   * the completion path, which is what re-reads the document and sets the dirty
   * flag and the undo state along with it.
   */
  it('never touches the stamp channel outside the completion path', async () => {
    // A completion path that declines to run the work must produce no writes.
    const recorded = recorder({ runOp: () => Promise.resolve(undefined) });
    await highlightSelection(PAYLOAD, recorded.deps);

    expect(recorded.highlights).toEqual([]);
  });

  it('settles the whole selection in ONE completion, not one per page', async () => {
    const recorded = recorder();
    await highlightSelection(PAYLOAD, recorded.deps);

    expect(recorded.ops).toHaveLength(1);
    expect(recorded.ops[0]?.docId).toBe('doc-1');
    expect(recorded.ops[0]?.label).toBe('Highlighting the selection');
  });

  it('reports what landed, and that it is not saved yet', async () => {
    const recorded = recorder();
    await highlightSelection(PAYLOAD, recorded.deps);

    expect(recorded.ops[0]?.receipt).toBe(
      'Highlighted 3 areas on 2 pages. Save the document to keep it.'
    );
  });

  it('names the page and the singular when only one area was marked', async () => {
    const recorded = recorder();
    const single = { ...PAYLOAD, pages: [PAYLOAD.pages[1] as SelectionPayload['pages'][number]] };
    await highlightSelection(single, recorded.deps);

    expect(recorded.ops[0]?.receipt).toBe(
      'Highlighted 1 area on page 6. Save the document to keep it.'
    );
  });

  it('counts areas, not pages, in the receipt', () => {
    expect(highlightReceipt(4, [3])).toBe(
      'Highlighted 4 areas on page 3. Save the document to keep it.'
    );
  });
});

describe('the live wiring', () => {
  // The defect was a missing dependency, so its absence is what gets pinned.
  it('gives highlight a real completion path to run in', () => {
    expect(typeof liveActionDeps().runOp).toBe('function');
  });
});

describe('redact', () => {
  it('hands one match per page to the redaction store', () => {
    const recorded = recorder();
    const quads = redactSelection(PAYLOAD, recorded.deps);

    expect(quads).toBe(3);
    expect(recorded.redactions).toHaveLength(1);
    expect(recorded.redactions[0]?.matches.map((match) => match.page)).toEqual([5, 6]);
  });

  /**
   * F-2's sibling question: Redact shares no part of the gap, because it writes
   * nothing. A mark is panel state until the attorney confirms the destruction,
   * so there is no document change for the completion path to settle and no
   * receipt to show.
   */
  it('changes no bytes and runs no completion of its own', () => {
    const recorded = recorder();
    redactSelection(PAYLOAD, recorded.deps);

    expect(recorded.ops).toEqual([]);
    expect(recorded.highlights).toEqual([]);
  });

  it('gives every selection-derived match its own ordinal', () => {
    const recorded = recorder();
    redactSelection(PAYLOAD, recorded.deps);
    redactSelection(PAYLOAD, recorded.deps);
    const ordinals = recorded.redactions.flatMap((call) =>
      call.matches.map((match) => match.index)
    );

    expect(new Set(ordinals).size).toBe(ordinals.length);
    for (const ordinal of ordinals) expect(ordinal).toBeGreaterThan(999_999);
  });
});

describe('the live redaction wiring', () => {
  beforeEach(() => {
    useRedactionStore.getState().forDocument(null);
  });

  it('produces marks the redaction panel can already apply', () => {
    const deps: SelectionActionDeps = recorder({
      markRedactions: (docId, matches) => {
        const store = useRedactionStore.getState();
        store.forDocument(docId);
        useRedactionStore.getState().markMatches(matches);
      },
    }).deps;
    redactSelection(PAYLOAD, deps);
    const { docId, marks } = useRedactionStore.getState();

    expect(docId).toBe('doc-1');
    expect(marks).toHaveLength(3);
    expect(new Set(marks.map((mark) => mark.id)).size).toBe(3);
    expect(marks.every((mark) => mark.sourceMatch !== undefined)).toBe(true);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { HighlightOptions, TextMatch } from '@shared/types';
import { useRedactionStore } from '../redact/redaction-store';
import {
  copySelection,
  copySelectionWithCite,
  highlightSelection,
  redactSelection,
  textWithCite,
} from './menu-actions';
import type { SelectionActionDeps } from './menu-actions';
import type { SelectionPayload } from './engine';

interface Recorded {
  deps: SelectionActionDeps;
  clipboard: string[];
  highlights: Array<{ docId: string; options: HighlightOptions }>;
  redactions: Array<{ docId: string; matches: readonly TextMatch[] }>;
}

function recorder(): Recorded {
  const clipboard: string[] = [];
  const highlights: Recorded['highlights'] = [];
  const redactions: Recorded['redactions'] = [];
  return {
    clipboard,
    highlights,
    redactions,
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
});

describe('redact', () => {
  it('hands one match per page to the redaction store', () => {
    const recorded = recorder();
    const quads = redactSelection(PAYLOAD, recorded.deps);

    expect(quads).toBe(3);
    expect(recorded.redactions).toHaveLength(1);
    expect(recorded.redactions[0]?.matches.map((match) => match.page)).toEqual([5, 6]);
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
    const deps: SelectionActionDeps = {
      writeText: () => Promise.resolve(),
      highlight: () => Promise.resolve(undefined),
      markRedactions: (docId, matches) => {
        const store = useRedactionStore.getState();
        store.forDocument(docId);
        useRedactionStore.getState().markMatches(matches);
      },
    };
    redactSelection(PAYLOAD, deps);
    const { docId, marks } = useRedactionStore.getState();

    expect(docId).toBe('doc-1');
    expect(marks).toHaveLength(3);
    expect(new Set(marks.map((mark) => mark.id)).size).toBe(3);
    expect(marks.every((mark) => mark.sourceMatch !== undefined)).toBe(true);
  });
});

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CenturionToolCall, ProgressEvent } from '@shared/types';
import { getBookmarks } from '@core/ops';
import { containsText, labelledPages, makeTestPdf } from '@core/ops/test-fixtures';
import { DocStore } from './doc-store';
import {
  CenturionToolExecutor,
  DECISION_TIMEOUT_MS,
  ToolDecisionGate,
  pagesPhrase,
  resolvePages,
  summarizeToolCall,
} from './centurion-executor';
import type { ExecutorHost } from './centurion-executor';

/** A real store over a real four-page PDF: the ops under test are not mocked. */
async function fixture(pages = 4): Promise<{
  docId: string;
  store: DocStore;
  host: ExecutorHost;
  progress: { channel: string; event: ProgressEvent }[];
}> {
  const store = new DocStore({
    recentFilePath: join(tmpdir(), `librarius-centurion-${Date.now()}.json`),
  });
  const bytes = await makeTestPdf({ pages: labelledPages(pages) });
  const session = await store.adopt(bytes, 'production.pdf');
  const progress: { channel: string; event: ProgressEvent }[] = [];
  const host: ExecutorHost = {
    store,
    emitProgress: (channel, event) => progress.push({ channel, event }),
  };
  return { docId: session.id, store, host, progress };
}

describe('running an approved call against the document', () => {
  it('stamps Bates numbers that can be read back out of the file', async () => {
    const { docId, store, host, progress } = await fixture();
    const before = store.bytes(docId);

    const receipt = await new CenturionToolExecutor(host).run(docId, {
      name: 'applyBates',
      input: { prefix: 'PLAINTIFF', startNumber: 1, padWidth: 6, position: 'bottom-right' },
    });

    expect(receipt).toBe('Done - 4 pages stamped, PLAINTIFF000001 to PLAINTIFF000004.');
    const after = store.bytes(docId);
    expect(after).not.toBe(before);
    for (const label of [
      'PLAINTIFF000001',
      'PLAINTIFF000002',
      'PLAINTIFF000003',
      'PLAINTIFF000004',
    ]) {
      expect(containsText(after, label)).toBe(true);
    }
    // Never a page more or a page fewer than it started with.
    expect(store.session(docId).pageCount).toBe(4);
    // Movement, on the same channel the Bates panel streams on.
    expect(progress.map((entry) => entry.channel)).toEqual(Array(4).fill('stamp:progress'));
    expect(progress.map((entry) => entry.event.current)).toEqual([1, 2, 3, 4]);
    expect(progress[0]?.event).toMatchObject({ docId, phase: 'Stamping Bates numbers', total: 4 });
  });

  it('starts the run where the model said, on the pages it named', async () => {
    const { docId, store, host } = await fixture();

    const receipt = await new CenturionToolExecutor(host).run(docId, {
      name: 'applyBates',
      input: { prefix: 'DEF', startNumber: 900, padWidth: 4, position: 'top-left', pages: [2, 3] },
    });

    expect(receipt).toBe('Done - 2 pages stamped, DEF0900 to DEF0901.');
    expect(containsText(store.bytes(docId), 'DEF0900')).toBe(true);
    expect(containsText(store.bytes(docId), 'DEF0902')).toBe(false);
  });

  it('watermarks, exhibit-stamps, and numbers pages with the same swap', async () => {
    const { docId, store, host } = await fixture();
    const executor = new CenturionToolExecutor(host);

    expect(
      await executor.run(docId, {
        name: 'applyWatermark',
        input: { text: 'CONFIDENTIAL', orientation: 'diagonal', opacityPct: 25 },
      })
    ).toBe('Done - "CONFIDENTIAL" watermarked on 4 pages.');
    expect(
      await executor.run(docId, {
        name: 'applyExhibitStamp',
        input: { label: 'EXHIBIT A', position: 'bottom-center', pages: [1] },
      })
    ).toBe('Done - "EXHIBIT A" stamped on 1 page.');
    expect(
      await executor.run(docId, {
        name: 'applyPageNumbers',
        input: { position: 'bottom-center' },
      })
    ).toBe('Done - 4 pages numbered, "Page 1 of 4" to "Page 4 of 4".');

    const bytes = store.bytes(docId);
    for (const marker of ['CONFIDENTIAL', 'EXHIBIT A', 'Page 1 of 4', 'Page 4 of 4']) {
      expect(containsText(bytes, marker)).toBe(true);
    }
    expect(store.session(docId).pageCount).toBe(4);
  });

  it('writes the outline the model proposed, nesting and all', async () => {
    const { docId, store, host } = await fixture();

    const receipt = await new CenturionToolExecutor(host).run(docId, {
      name: 'setBookmarks',
      input: {
        bookmarks: [
          { title: 'Exhibits', page: 2, children: [{ title: 'Exhibit A', page: 3 }] },
          { title: 'Declaration', page: 4 },
        ],
      },
    });

    expect(receipt).toBe('Done - 2 top-level bookmarks written, starting "Exhibits".');
    const outline = await getBookmarks(store.bytes(docId));
    expect(outline.map((node) => node.title)).toEqual(['Exhibits', 'Declaration']);
    expect(outline[0]?.children.map((node) => node.page)).toEqual([3]);
  });

  it('refuses a page the document does not have, before it touches the bytes', async () => {
    const { docId, store, host } = await fixture();
    const before = store.bytes(docId);

    await expect(
      new CenturionToolExecutor(host).run(docId, {
        name: 'applyExhibitStamp',
        input: { label: 'EXHIBIT Z', position: 'bottom-right', pages: [99] },
      })
    ).rejects.toThrow(/ends at page 4, so page 99 does not exist/);
    // Byte-identical: the refusal happened before anything was swapped in.
    expect(store.bytes(docId)).toBe(before);
    expect(store.session(docId).pageCount).toBe(4);
  });

  // Engineering rule 2: destruction is never something a model can trigger.
  it('will not mark or apply redactions in the main process', async () => {
    const { docId, host } = await fixture();
    await expect(
      new CenturionToolExecutor(host).run(docId, {
        name: 'suggestRedactions',
        input: { terms: [{ text: 'secret', reason: 'PII' }] },
      })
    ).rejects.toThrow(/never in the main process/);
  });

  // Signature fields are panel metadata, placed in the renderer over the viewer.
  it('will not place signature fields in the main process', async () => {
    const { docId, host } = await fixture();
    await expect(
      new CenturionToolExecutor(host).run(docId, {
        name: 'addSignatureFields',
        input: {
          signers: [{ name: 'Jane Smith', email: 'jane@example.com' }],
          fields: [
            {
              kind: 'signature',
              signerEmail: 'jane@example.com',
              page: 1,
              anchorText: 'By:',
              placement: 'on',
            },
          ],
        },
      })
    ).rejects.toThrow(/never in the main process/);
  });

  it('resolves an omitted page list to the whole document', () => {
    expect(resolvePages(undefined, 3)).toEqual([1, 2, 3]);
    expect(resolvePages([2], 3)).toEqual([2]);
    expect(() => resolvePages([4], 3)).toThrow(/ends at page 3/);
  });
});

describe('the sentence the attorney approves', () => {
  const bates: CenturionToolCall = {
    name: 'applyBates',
    input: { prefix: 'PLAINTIFF', startNumber: 1, padWidth: 6, position: 'bottom-right' },
  };

  it('says what will happen, in the words an attorney would use', () => {
    expect(summarizeToolCall(bates, 450)).toBe(
      'Stamp PLAINTIFF000001 to PLAINTIFF000450 on all 450 pages, bottom right.'
    );
    expect(
      summarizeToolCall(
        {
          name: 'applyWatermark',
          input: { text: 'DRAFT', orientation: 'diagonal', opacityPct: 25, pages: [1, 2, 3] },
        },
        10
      )
    ).toBe('Watermark pages 1-3 with "DRAFT", diagonal, 25% strength.');
    expect(
      summarizeToolCall(
        {
          name: 'applyExhibitStamp',
          input: { label: 'EXHIBIT A', position: 'bottom-center', pages: [12] },
        },
        450
      )
    ).toBe('Stamp "EXHIBIT A" on page 12, bottom centre.');
    expect(
      summarizeToolCall({ name: 'applyPageNumbers', input: { position: 'bottom-center' } }, 20)
    ).toBe('Number all 20 pages "Page 1 of 20", bottom centre.');
    expect(
      summarizeToolCall(
        { name: 'setBookmarks', input: { bookmarks: [{ title: 'Exhibit A', page: 3 }] } },
        20
      )
    ).toBe('Replace the bookmarks with 1 entries, starting "Exhibit A" at page 3.');
  });

  it('counts fields per signer, by name, when it proposes signature fields', () => {
    const summary = summarizeToolCall(
      {
        name: 'addSignatureFields',
        input: {
          signers: [
            { name: 'Jane Smith', email: 'jane@example.com' },
            { name: 'John Doe', email: 'john@example.com' },
          ],
          fields: [
            {
              kind: 'signature',
              signerEmail: 'jane@example.com',
              page: 4,
              anchorText: 'By:',
              placement: 'on',
            },
            {
              kind: 'date',
              signerEmail: 'JANE@example.com',
              page: 4,
              anchorText: 'Date:',
              placement: 'right-of',
            },
            {
              kind: 'name',
              signerEmail: 'jane@example.com',
              page: 4,
              anchorText: 'Name:',
              placement: 'right-of',
            },
            {
              kind: 'signature',
              signerEmail: 'john@example.com',
              page: 5,
              anchorText: 'By:',
              placement: 'on',
            },
            {
              kind: 'date',
              signerEmail: 'john@example.com',
              page: 5,
              anchorText: 'Date:',
              placement: 'right-of',
            },
          ],
        },
      },
      20
    );
    expect(summary).toBe(
      'Add 5 e-sign fields for 2 signers to the E-Sign panel (Jane Smith: 3, John Doe: 2).'
    );
  });

  // The card has to say what it will NOT do, or "redaction" reads as destruction.
  it('promises marks only when it proposes redactions', () => {
    const summary = summarizeToolCall(
      {
        name: 'suggestRedactions',
        input: { terms: [{ text: '123-45-6789', reason: 'Social security number' }] },
      },
      20
    );
    expect(summary).toContain('"123-45-6789"');
    expect(summary).toContain('nothing is destroyed');
  });

  it('counts pages the way a person would', () => {
    expect(pagesPhrase(undefined, 450)).toBe('all 450 pages');
    expect(pagesPhrase([7], 450)).toBe('page 7');
    expect(pagesPhrase([3, 4, 5], 450)).toBe('pages 3-5');
    expect(pagesPhrase([3, 9, 40], 450)).toBe('3 pages');
  });
});

describe('waiting for the attorney', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the answer that comes back', async () => {
    const gate = new ToolDecisionGate();
    const pending = gate.waitFor('req-1', 'toolu_1');
    expect(gate.pending).toBe(1);

    expect(gate.settle('req-1', 'toolu_1', 'approved')).toBe(true);
    await expect(pending).resolves.toBe('approved');
    expect(gate.pending).toBe(0);
  });

  it('carries the renderer receipt back with the verdict', async () => {
    const gate = new ToolDecisionGate();
    const pending = gate.waitFor('req-1', 'toolu_1');
    gate.settle('req-1', 'toolu_1', { verdict: 'approved', detail: 'Marked 12 instances.' });
    await expect(pending).resolves.toEqual({ verdict: 'approved', detail: 'Marked 12 instances.' });
  });

  it('ignores an answer to a card that is not on screen', () => {
    const gate = new ToolDecisionGate();
    expect(gate.settle('req-1', 'toolu_1', 'approved')).toBe(false);
  });

  it('never lets a second click run the same call twice', async () => {
    const gate = new ToolDecisionGate();
    const pending = gate.waitFor('req-1', 'toolu_1');
    expect(gate.settle('req-1', 'toolu_1', 'approved')).toBe(true);
    expect(gate.settle('req-1', 'toolu_1', 'approved')).toBe(false);
    await pending;
  });

  // Silence is a refusal: a card left open must never run an hour later.
  it('refuses a card nobody answered', async () => {
    vi.useFakeTimers();
    const gate = new ToolDecisionGate();
    const pending = gate.waitFor('req-1', 'toolu_1');

    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS - 1);
    expect(gate.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(2);

    await expect(pending).resolves.toEqual({
      verdict: 'rejected',
      detail: 'No answer after five minutes - skipped.',
    });
    expect(gate.pending).toBe(0);
  });

  it('refuses every open card when the ask dies', async () => {
    const gate = new ToolDecisionGate();
    const first = gate.waitFor('req-1', 'toolu_1');
    const second = gate.waitFor('req-1', 'toolu_2');

    gate.abandonAll();

    await expect(first).resolves.toMatchObject({ verdict: 'rejected' });
    await expect(second).resolves.toMatchObject({ verdict: 'rejected' });
    expect(gate.pending).toBe(0);
  });
});

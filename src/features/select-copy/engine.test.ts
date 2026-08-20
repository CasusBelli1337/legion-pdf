import { describe, expect, it } from 'vitest';
import { createSelectCopyEngine } from './engine';
import type { PageItemSource, SelectionPayload } from './engine';
import type { SelectedRun } from './dom-selection';
import { condensedSheet, pleadingPage, plainPage } from './synthetic-pages';
import type { PageInput } from './page-classifier';

const HEADER = 'ASHFORD v. ASHFORD — DEPOSITION OF JAMES ASHFORD';

const TESTIMONY = [
  'Q. Did you review the trust instrument before signing it?',
  'A. I did not read the whole document, only the signa-',
  'ture page that Mr. Pemberton put in front of me.',
  'Q. And no one read the rest of it to you?',
  'A. No one did.',
];

/** Cover, index, then six pleading pages printed 1-6. */
function depositionPages(): PageInput[] {
  return [
    plainPage(1, ['DEPOSITION OF JAMES ASHFORD']),
    plainPage(2, ['INDEX OF EXAMINATION']),
    ...[3, 4, 5, 6, 7, 8].map((page) =>
      pleadingPage({
        page,
        printed: page - 2,
        lines: TESTIMONY.map((line) => `${line} (sheet ${page})`),
        header: HEADER,
        bates: `ASHFORD00012${page}`,
      })
    ),
  ];
}

function sourceOf(pages: readonly PageInput[]): PageItemSource & { reads: number } {
  const source = {
    docId: 'doc-1',
    pageCount: pages.length,
    reads: 0,
    loadPage(page: number): Promise<PageInput> {
      source.reads += 1;
      const input = pages[page - 1];
      if (input === undefined) throw new RangeError(`No page ${page}`);
      return Promise.resolve(input);
    },
  };
  return source;
}

function runsForLines(page: PageInput, matching: (text: string) => boolean): SelectedRun[] {
  return page.items
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter((entry) => matching(entry.item.str))
    .map((entry) => ({
      page: page.page,
      itemIndex: entry.itemIndex,
      from: 0,
      to: entry.item.str.length,
    }));
}

async function payloadFor(
  pages: readonly PageInput[],
  runs: SelectedRun[],
  prefix = ''
): Promise<SelectionPayload | null> {
  const engine = createSelectCopyEngine(sourceOf(pages));
  engine.setCitePrefix(prefix);
  return engine.selectionPayload(runs);
}

describe('the engine end to end', () => {
  it('classifies a page and reports the printed number, not the PDF index', async () => {
    const engine = createSelectCopyEngine(sourceOf(depositionPages()));
    const classification = await engine.classifyPage(5);

    expect(classification.page).toBe(5);
    expect(classification.printedPageNumber).toBe(3);
    expect(classification.printedNumberConfidence).toBe('high');
    expect(classification.lineNumberColumns).toHaveLength(1);
  });

  it('copies flowing body text and leaves the furniture behind', async () => {
    const pages = depositionPages();
    const page = pages[4];
    if (page === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      pages,
      runsForLines(page, (text) => text.startsWith('Q. Did you') || text.startsWith('A. I did not'))
    );

    expect(payload?.text).toBe(
      'Q. Did you review the trust instrument before signing it? (sheet 5) ' +
        'A. I did not read the whole document, only the signa- (sheet 5)'
    );
    expect(payload?.text).not.toContain(HEADER);
    expect(payload?.text).not.toContain('ASHFORD00012');
  });

  it('cites the printed page and the margin lines', async () => {
    const pages = depositionPages();
    const page = pages[4];
    if (page === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      pages,
      runsForLines(page, (text) => text.startsWith('Q.') || text.startsWith('A.'))
    );

    expect(payload?.cite?.formatted).toBe('(3:1-5)');
    expect(payload?.citeConfidence).toBe('high');
  });

  it('puts the document source label in the cite it hands the clipboard', async () => {
    const pages = depositionPages();
    const page = pages[4];
    if (page === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      pages,
      runsForLines(page, (text) => text.startsWith('A. No one did')),
      'Ashford Depo.'
    );

    expect(payload?.cite?.formatted).toBe('(Ashford Depo. 3:5)');
  });

  it('hands back one merged rectangle per line for highlight and redact', async () => {
    const pages = depositionPages();
    const page = pages[4];
    if (page === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      pages,
      runsForLines(page, (text) => text.startsWith('Q. Did you') || text.startsWith('A. I did not'))
    );

    expect(payload?.pages).toHaveLength(1);
    expect(payload?.pages[0]?.page).toBe(5);
    expect(payload?.pages[0]?.quads).toHaveLength(2);
  });

  it('reads each page once however many times it is classified', async () => {
    const source = sourceOf(depositionPages());
    const engine = createSelectCopyEngine(source);
    await engine.classifyPage(5);
    const after = source.reads;
    await engine.classifyPage(5);
    await engine.classifyPage(5);

    expect(source.reads).toBe(after);
  });

  it('refuses a page outside the document rather than returning an empty one', async () => {
    const engine = createSelectCopyEngine(sourceOf(depositionPages()));
    await expect(engine.classifyPage(99)).rejects.toThrow(/outside this document/);
  });

  it('returns nothing for a selection that touched no body text', async () => {
    const pages = depositionPages();
    const page = pages[4];
    if (page === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      pages,
      runsForLines(page, (text) => text === HEADER)
    );

    expect(payload).toBeNull();
  });

  it('cites a condensed sheet by its mini-page number', async () => {
    const sheets = [1, 2].map((sheet) =>
      condensedSheet(sheet, [
        { number: (sheet - 1) * 4 + 41, lines: ['alpha line'] },
        { number: (sheet - 1) * 4 + 42, lines: ['bravo line'] },
        { number: (sheet - 1) * 4 + 43, lines: ['charlie line'] },
        { number: (sheet - 1) * 4 + 44, lines: ['delta line'] },
      ])
    );
    const sheet = sheets[1];
    if (sheet === undefined) throw new Error('fixture');
    const payload = await payloadFor(
      sheets,
      runsForLines(sheet, (text) => text === 'bravo line')
    );

    expect(payload?.text).toBe('bravo line');
    expect(payload?.cite?.formatted).toBe('(46:1)');
    expect(payload?.citeConfidence).toBe('high');
  });
});

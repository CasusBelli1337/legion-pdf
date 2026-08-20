/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createSelectCopyEngine } from './engine';
import { createPdfjsSource } from './pdfjs-source';
import type { SelectedRun } from './dom-selection';

const ROOT = path.join(import.meta.dirname, '../../..');
const FIXTURES = path.join(ROOT, 'qa/fixtures');
const STANDARD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/');

/**
 * These run against the REAL generated PDFs, which are gitignored — the whole
 * point is to prove the heuristics survive what pdfjs actually reports, which a
 * hand-built page cannot. Run `node qa/make-fixtures.mjs` once and they run;
 * without the fixtures they skip rather than fail a clean checkout.
 */
const built = existsSync(path.join(FIXTURES, 'pleading-fixture.pdf'));

async function open(name: string) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(await readFile(path.join(FIXTURES, name)));
  return getDocument({ data: bytes, useSystemFonts: false, standardFontDataUrl: STANDARD_FONTS })
    .promise;
}

async function itemsOf(document: Awaited<ReturnType<typeof open>>, page: number) {
  const pdfPage = await document.getPage(page);
  const content = await pdfPage.getTextContent();
  return content.items.map((item: unknown) => (item as { str?: string }).str ?? '');
}

function runsFor(
  strings: string[],
  page: number,
  wanted: (text: string) => boolean
): SelectedRun[] {
  return strings
    .map((str, itemIndex) => ({ str, itemIndex }))
    .filter((entry) => wanted(entry.str))
    .map((entry) => ({ page, itemIndex: entry.itemIndex, from: 0, to: entry.str.length }));
}

describe.skipIf(!built)('pleading-fixture.pdf', () => {
  it('reports every printed page number the manifest promises', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const printed: Array<number | null> = [];
    for (let page = 1; page <= 8; page += 1) {
      const classification = await engine.classifyPage(page);
      printed.push(classification.printedPageNumber);
    }
    expect(printed).toEqual([null, null, 1, 2, 3, 4, 5, 6]);
  });

  it('finds a 28-number column on every page and calls every number off', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    for (let page = 3; page <= 8; page += 1) {
      const classification = await engine.classifyPage(page);
      const lineNumbers = classification.items.filter((item) => item.role === 'line-number');
      expect({ page, count: lineNumbers.length }).toEqual({ page, count: 28 });
      expect(classification.lineNumberColumns).toHaveLength(1);
    }
  });

  it('calls the running head, the Bates stamp and the footer number off', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    for (let page = 3; page <= 8; page += 1) {
      const roles = (await engine.classifyPage(page)).items;
      const count = (role: string): number => roles.filter((item) => item.role === role).length;
      expect({
        page,
        header: count('header'),
        stamp: count('stamp'),
        number: count('page-number'),
      }).toEqual({ page, header: 1, stamp: 1, number: 1 });
    }
  });

  it('copies a whole page as body text and nothing else', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 5);
    const text = await engine.smartText(runsFor(strings, 5, () => true));

    expect(text).not.toContain('ASHFORD v. ASHFORD');
    expect(text).not.toContain('ASHFORD00012');
    expect(text).toContain('Q. On transcript page three');
    // Four paragraphs, not five: the opening question is the WIDEST line on the
    // page, so the "this line stopped short, its paragraph ended" test cannot
    // fire on it and it keeps the answer that follows. Harmless here and the
    // honest limit of a heuristic that has no other signal to go on.
    expect(text.split('\n\n').map((paragraph) => paragraph.slice(0, 16))).toEqual([
      'Q. On transcript',
      'Q. And no one re',
      'A. No one did.',
      'Q. Turning to th',
    ]);
  });

  it('copies flowing body text and heals the broken word', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 3);
    const runs = runsFor(strings, 3, (text) =>
      /^(Q\. On transcript|A\. I did not|ture page)/.test(text)
    );

    expect(await engine.smartText(runs)).toBe(
      'Q. On transcript page one, did you review the trust instrument? ' +
        'A. I did not read the whole document, only the signature page that ' +
        'Mr. Pemberton put in front of me.'
    );
  });

  it('cites the printed page and the margin lines', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 3);

    const wide = runsFor(strings, 3, (text) =>
      /^(Q\. On transcript|A\. I did not|ture page)/.test(text)
    );
    expect((await engine.citeFor(wide))?.formatted).toBe('(1:1-3)');

    const single = runsFor(strings, 3, (text) => text.startsWith('A. No one did'));
    expect((await engine.citeFor(single))?.formatted).toBe('(1:5)');
  });

  it('cites across a page break, and takes a source label', async () => {
    const document = await open('pleading-fixture.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const third = await itemsOf(document, 3);
    const fourth = await itemsOf(document, 4);
    const runs = [
      ...runsFor(third, 3, (text) => text.startsWith('before the date')),
      ...runsFor(fourth, 4, (text) => text.startsWith('A. I did not')),
    ];

    expect((await engine.citeFor(runs))?.formatted).toBe('(1:8-2:2)');
    engine.setCitePrefix('Ashford Depo.');
    expect((await engine.citeFor(runs))?.formatted).toBe('(Ashford Depo. 1:8-2:2)');
  });
});

describe.skipIf(!built)('condensed-transcript.pdf', () => {
  it('finds four independent line columns on every sheet', async () => {
    const document = await open('condensed-transcript.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    for (let page = 1; page <= 4; page += 1) {
      const classification = await engine.classifyPage(page);
      expect({ page, columns: classification.lineNumberColumns.length }).toEqual({
        page,
        columns: 4,
      });
      expect(classification.lineNumberColumns.map((column) => column.quadrant)).toEqual([
        0, 1, 2, 3,
      ]);
      const lineNumbers = classification.items.filter((item) => item.role === 'line-number');
      expect(lineNumbers).toHaveLength(100);
    }
  });

  it('copies one mini-page cleanly and cites it by its own number', async () => {
    const document = await open('condensed-transcript.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 1);
    const runs = runsFor(strings, 1, (text) => /^[QA]\. Page 42 line (one|two)/.test(text));

    expect(await engine.smartText(runs)).toBe(
      'Q. Page 42 line one of the condensed transcript. ' +
        'A. Page 42 line two, continuing the same answer.'
    );
    expect((await engine.citeFor(runs))?.formatted).toBe('(42:1-2)');
  });

  it('reads the whole sheet mini-page by mini-page, never across the fold', async () => {
    const document = await open('condensed-transcript.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 1);
    const runs = runsFor(strings, 1, (text) => /line one of the condensed/.test(text));
    const text = await engine.smartText(runs);

    expect(text.indexOf('Page 41')).toBeLessThan(text.indexOf('Page 42'));
    expect(text.indexOf('Page 42')).toBeLessThan(text.indexOf('Page 43'));
    expect(text.indexOf('Page 43')).toBeLessThan(text.indexOf('Page 44'));
  });

  it('cites across the fold from one mini-page to the next', async () => {
    const document = await open('condensed-transcript.pdf');
    const engine = createSelectCopyEngine(createPdfjsSource(document, 'fixture'));
    const strings = await itemsOf(document, 1);
    const runs = runsFor(
      strings,
      1,
      (text) => text.startsWith('Page 42 line 25') || text.startsWith('Q. Page 43 line one')
    );

    expect((await engine.citeFor(runs))?.formatted).toBe('(42:25-43:1)');
  });
});

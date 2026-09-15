/// <reference types="node" />
/**
 * Real served court documents, kept OUTSIDE the repository (they name real
 * parties): `WORD_PRIVATE_CORPUS=<folder> npm run test:word -- private-corpus`
 * grades every PDF in the folder and writes the evidence to `<folder>/report/`
 * — a summary table, a JSON report and side-by-side PNGs per document. Nothing
 * here asserts a threshold: these documents have no ground truth but the
 * attorney's eye; the suite exists to put numbers and pictures in front of it.
 */

import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { grade } from './grade';
import type { Graded } from './grade';
import { tesseractReachable } from './ocr';
import { pageCountOf, popplerReachable, wordReachable } from './word-render';

const folder = process.env.WORD_PRIVATE_CORPUS;
const ready =
  folder !== undefined &&
  existsSync(folder) &&
  wordReachable() &&
  popplerReachable() &&
  tesseractReachable();
/** Above this many pages the PNGs are skipped; the JSON and Word's PDF are still written. */
const PNG_PAGE_LIMIT = 40;

function row(graded: Graded, pages: number): string {
  const worst = graded.fidelity.pages.reduce((max, page) => Math.max(max, page.medianDy), 0);
  const missing = graded.fidelity.pages.reduce(
    (sum, page) => sum + page.missing.length + page.extra.length,
    0
  );
  const numbers = graded.fidelity.pages.flatMap((page) => page.lineNumbers);
  const off = numbers.filter((entry) => entry.dy === null || Math.abs(entry.dy) > 0.5).length;
  return `| ${graded.name} | ${pages} → ${graded.fidelity.exportedPages} | ${worst.toFixed(2)} | ${missing} | ${numbers.length === 0 ? '—' : `${off} of ${numbers.length}`} | ${graded.notes.join(' ').slice(0, 120)} |`;
}

describe.skipIf(!ready)('Word export over the private corpus of real filings', () => {
  it('grades every document and writes the report', async () => {
    const dir = folder as string;
    const report = path.join(dir, 'report');
    const files = (await readdir(dir)).filter((name) => /\.pdf$/i.test(name)).sort();
    expect(files.length).toBeGreaterThan(0);
    const rows: string[] = [
      '| document | pages | worst page median dy (pt) | words off | line numbers off | notes |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    for (const file of files) {
      const source = path.join(dir, file);
      const pages = await pageCountOf(source);
      try {
        const graded = await grade(source, report, { png: pages <= PNG_PAGE_LIMIT });
        rows.push(row(graded, pages));
        process.stdout.write(`${file}\n  ${graded.summary.join('\n  ')}\n`);
      } catch (error) {
        rows.push(
          `| ${file} | ${pages} | FAILED | | | ${error instanceof Error ? error.message.split('\n')[0] : String(error)} |`
        );
        process.stdout.write(
          `${file}\n  FAILED: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
      await writeFile(path.join(report, 'SUMMARY.md'), `${rows.join('\n')}\n`);
    }
  });
});

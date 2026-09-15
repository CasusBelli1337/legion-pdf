/// <reference types="node" />
/**
 * The Word-export fidelity suite (`npm run test:word`). For every fixture in
 * the corpus: the app's own pipeline builds the .docx, REAL Word renders it,
 * and the rendering is measured against the source — same page count, the
 * same words on every page, every baseline within the fixture's tolerance,
 * every pleading line number on its line. Side-by-side PNGs and a JSON report
 * per fixture land in qa/output/word-export/ for the human pass.
 *
 * Skips itself cleanly when Word, poppler, or Tesseract is not reachable, or
 * when the corpus has not been built.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageFidelity } from './compare';
import { CORPUS } from './fixtures';
import type { CorpusFixture } from './fixtures';
import { grade } from './grade';
import { tesseractReachable } from './ocr';
import { popplerReachable, wordReachable } from './word-render';

const ROOT = path.join(import.meta.dirname, '../..');
const FIXTURES = path.join(ROOT, 'qa/fixtures/word-export');
const OUTPUT = path.join(ROOT, 'qa/output/word-export');

const ready =
  wordReachable() &&
  popplerReachable() &&
  tesseractReachable() &&
  CORPUS.every((fixture) => existsSync(path.join(FIXTURES, `${fixture.name}.pdf`)));

function expectPage(page: PageFidelity, fixture: CorpusFixture, context: string): void {
  expect(
    page.missing.length + page.extra.length,
    `${context} words: ${page.missing.slice(0, 8).join(' | ')} / ${page.extra.slice(0, 8).join(' | ')}`
  ).toBeLessThanOrEqual(fixture.wordsTolerance);
  expect(page.medianDy, `${context} median baseline drift`).toBeLessThanOrEqual(fixture.medianDy);
  expect(page.p95Dy, `${context} p95 baseline drift`).toBeLessThanOrEqual(fixture.p95Dy);
  if (!fixture.lineNumbers) return;
  const off = page.lineNumbers.filter((entry) => entry.dy === null || Math.abs(entry.dy) > 0.5);
  expect(
    off,
    `${context} line numbers off their lines: ${off.map((entry) => `${entry.value}:${entry.dy?.toFixed(2) ?? 'missing'}`).join(' ')}`
  ).toHaveLength(0);
}

describe.skipIf(!ready)('Word export fidelity, rendered in real Word', () => {
  for (const fixture of CORPUS) {
    it(`${fixture.name}: ${fixture.purpose}`, async () => {
      const { fidelity, summary } = await grade(path.join(FIXTURES, `${fixture.name}.pdf`), OUTPUT);
      const context = `${fixture.name} —\n${summary.join('\n')}\n`;
      expect(fidelity.exportedPages, `${context}page count`).toBe(fidelity.sourcePages);
      for (const page of fidelity.pages) expectPage(page, fixture, `${context}page ${page.page}`);
    });
  }
});

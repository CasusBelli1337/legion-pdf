/// <reference types="node" />
/**
 * One document through the whole pipeline and back: recognise any scanned
 * pages, build the .docx with the app's own exporter, render it in real Word,
 * measure the rendering against the source, and leave the evidence on disk —
 * the .docx, Word's PDF, a JSON report, and side-by-side PNGs.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDocx } from '@core/export';
import { layoutsOf } from '@renderer/lib/layout/node-pipeline.testkit';
import { wordsOf } from './bbox';
import { compareDocuments, summarize } from './compare';
import type { Fidelity } from './compare';
import { readPdf, recognizeScannedPages } from './ocr';
import { rasterizePages, renderWithWord } from './word-render';

export interface Graded {
  name: string;
  fidelity: Fidelity;
  summary: string[];
  notes: string[];
  docxPath: string;
  renderedPath: string;
}

export interface GradeOptions {
  /** Side-by-side PNGs; off for very long documents. */
  png?: boolean;
  /** Measure against this PDF instead of the source (a scan is measured against what was scanned). */
  truthPath?: string;
}

export async function grade(
  sourcePath: string,
  outputDir: string,
  options: GradeOptions = {}
): Promise<Graded> {
  const name = path.basename(sourcePath).replace(/\.pdf$/i, '');
  const source = await recognizeScannedPages(await readPdf(sourcePath), sourcePath);
  const build = await buildDocx(await layoutsOf(source.bytes), { title: name });
  await mkdir(path.join(outputDir, 'png'), { recursive: true });
  const docxPath = path.join(outputDir, `${name}.docx`);
  await writeFile(docxPath, build.bytes);
  const renderedPath = await renderWithWord(docxPath, outputDir);
  const truthPath = options.truthPath ?? sourcePath;
  const fidelity = compareDocuments(await wordsOf(truthPath), await wordsOf(renderedPath));
  const summary = summarize(fidelity);
  await writeFile(
    path.join(outputDir, `${name}.fidelity.json`),
    JSON.stringify(
      {
        source: sourcePath,
        recognized: source.recognized,
        notes: build.notes,
        receipt: build.receipt,
        summary,
        fidelity,
      },
      null,
      2
    )
  );
  if (options.png !== false) {
    await rasterizePages(truthPath, path.join(outputDir, 'png', `src-${name}`));
    await rasterizePages(renderedPath, path.join(outputDir, 'png', name));
  }
  return { name, fidelity, summary, notes: build.notes, docxPath, renderedPath };
}

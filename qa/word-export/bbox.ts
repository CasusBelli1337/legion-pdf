/// <reference types="node" />
/**
 * Every word on every page with its TRUE baseline, read with pdf.js: the
 * text matrix's translation is the baseline, whatever the font's metrics say.
 * (`pdftotext -bbox` reports glyph boxes instead, and two subsets of the same
 * Times New Roman can disagree by two points about where the box ends — a
 * font artefact that looked like drift.) Coordinates are TOP-down points, so
 * `yMax` is the baseline measured from the top edge of the page.
 */

import { readFile } from 'node:fs/promises';
import { openBytes } from '@renderer/lib/layout/node-pipeline.testkit';

export interface BboxWord {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  /** The baseline, from the top of the page. */
  yMax: number;
}

export interface BboxPage {
  page: number;
  width: number;
  height: number;
  words: BboxWord[];
}

interface TextItemLike {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
}

interface PageLike {
  view: readonly number[];
  getTextContent(): Promise<{ items: unknown[] }>;
}

function isTextItem(item: unknown): item is TextItemLike {
  return (
    typeof item === 'object' && item !== null && typeof (item as TextItemLike).str === 'string'
  );
}

/** An item's words, each given a share of the item's advance in proportion to its characters. */
function wordsOfItem(item: TextItemLike, height: number): BboxWord[] {
  const [, , , d = 0, e = 0, f = 0] = item.transform;
  const size = item.height > 0 ? item.height : Math.abs(d);
  const baseline = height - f;
  const perChar = item.str.length === 0 ? 0 : item.width / item.str.length;
  const words: BboxWord[] = [];
  const pattern = /\S+/g;
  for (const match of item.str.matchAll(pattern)) {
    const start = e + perChar * match.index;
    words.push({
      text: match[0],
      xMin: start,
      xMax: start + perChar * match[0].length,
      yMin: baseline - size,
      yMax: baseline,
    });
  }
  return words;
}

export async function wordsOf(pdfPath: string): Promise<BboxPage[]> {
  const document = await openBytes(new Uint8Array(await readFile(pdfPath)));
  const pages: BboxPage[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = (await document.getPage(number)) as unknown as PageLike;
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
    const height = y1 - y0;
    const content = await page.getTextContent();
    const words = content.items.flatMap((item) =>
      isTextItem(item) ? wordsOfItem(item, height) : []
    );
    pages.push({ page: number, width: x1 - x0, height, words });
  }
  await document.loadingTask.destroy();
  return pages;
}

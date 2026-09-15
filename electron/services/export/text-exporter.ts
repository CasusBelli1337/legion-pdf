/**
 * Plain text out of a PDF — "just the words", page by page.
 *
 * Attorneys paste this into a brief, a search tool, or an e-mail, so the page
 * boundaries have to survive: each page is announced by a `----- Page 3 -----`
 * line and separated by a form feed, which is what every text editor and
 * printer has understood as "new page" since before any of this existed.
 *
 * The important promise is the empty one. A scan has no text at all, and a TXT
 * file full of nothing but page headers looks like a successful export. So a
 * document where every page comes back blank is a LOUD failure that names the
 * fix (run Text Recognition), and a partial blank is a note on the receipt.
 */

import { assertNotCancelled } from './cancellation';
import type { Exporter } from './exporter';

const PHASE = 'Reading the text';
const FORM_FEED = '\f';

export function pageSeparator(page: number): string {
  return `----- Page ${page} -----`;
}

export function pageBlock(page: number, text: string): string {
  return `${pageSeparator(page)}\n\n${text.trimEnd()}\n`;
}

export function joinPages(blocks: readonly string[]): string {
  return blocks.join(FORM_FEED);
}

export function noTextMessage(pageCount: number): string {
  return (
    `None of the ${pageCount} ${pageCount === 1 ? 'page carries' : 'pages carry'} any text — ` +
    'this document is a picture of the words. Run Text Recognition first, then export again.'
  );
}

function emptyPageNote(empty: number, total: number): string[] {
  if (empty === 0) return [];
  return [
    `${empty} of the ${total} pages had no text to copy. Those pages are probably scans — ` +
      'run Text Recognition to make them searchable.',
  ];
}

export const textExporter: Exporter = async (job, context) => {
  const source = await context.openText(job.bytes);
  const blocks: string[] = [];
  let empty = 0;
  try {
    for (const [index, page] of job.pages.entries()) {
      assertNotCancelled(job.signal, index, 0);
      job.report(index + 1, job.pages.length, PHASE);
      const text = await source.pageText(page);
      if (text.trim().length === 0) empty += 1;
      blocks.push(pageBlock(page, text));
    }
  } finally {
    await source.close();
  }

  if (blocks.length !== job.pages.length) {
    throw new Error(
      `Only ${blocks.length} of the ${job.pages.length} pages were read. Nothing was saved.`
    );
  }
  if (empty === job.pages.length) throw new Error(noTextMessage(job.pages.length));

  await context.writeFile(job.options.outputPath, new TextEncoder().encode(joinPages(blocks)));
  return {
    format: 'txt',
    files: [job.options.outputPath],
    pagesExported: job.pages.length,
    notes: emptyPageNote(empty, job.pages.length),
  };
};

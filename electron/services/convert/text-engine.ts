/**
 * Plain text and web pages without Word.
 *
 * Two different problems wearing one label. A .txt has no layout at all, so
 * core/ops/text-to-pdf.ts invents a sensible one (Letter, one-inch margins,
 * Courier) — a pure function with a page count to prove. A .html already has a
 * layout and only a browser can honour it, so Chromium prints it.
 *
 * Both are fallbacks: when Microsoft Word is installed the registry sends these
 * extensions there first, because Word's own output is what the attorney expects
 * to see.
 */

import { readFile } from 'node:fs/promises';
import { textToPdf } from '@core/ops';
import { ConvertFailedError, type ConvertEngine, type ConvertJob } from './types';

const HTML_EXTENSIONS = ['.html', '.htm'];
/** A text file bigger than this is a database export, not a document. */
const MAX_TEXT_BYTES = 20 * 1024 * 1024;

async function run(job: ConvertJob): Promise<Uint8Array> {
  if (HTML_EXTENSIONS.includes(job.extension)) {
    const { printHtmlFile } = await import('./chromium-print');
    return printHtmlFile(job.filePath, job.fileName);
  }
  const bytes = await readFile(job.filePath);
  if (bytes.byteLength > MAX_TEXT_BYTES) {
    throw new ConvertFailedError(
      `${job.fileName} is ${Math.round(bytes.byteLength / 1024 / 1024)} MB of text — too large to ` +
        'lay out as a PDF. Split it up first.'
    );
  }
  const result = await textToPdf(bytes.toString('utf8'));
  return result.bytes;
}

export const TEXT_ENGINE: ConvertEngine = {
  id: 'text',
  label: 'Built-in text converter',
  extensions: ['.txt', ...HTML_EXTENSIONS],
  note: () =>
    'Plain text is laid out on Letter pages with one-inch margins; web pages are printed the way ' +
    'a browser shows them.',
  available: () => Promise.resolve(true),
  run,
};

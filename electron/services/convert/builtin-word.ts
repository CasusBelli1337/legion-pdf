/**
 * Opening a Word document on a computer that has no Word.
 *
 * mammoth reads the .docx's own XML and emits semantic HTML — headings stay
 * headings, lists stay lists, tables stay tables, embedded pictures come through
 * as data: URIs — and Chromium prints it. What it CANNOT do is reproduce Word's
 * pagination, its exact fonts, or pleading-paper line numbers, because none of
 * that is in the file: Word computes it at layout time. So this engine reports
 * itself available only when Word is absent, and says plainly what it gives up.
 *
 * mammoth's HTML is inserted into the page as HTML — that is the whole point of
 * it — and the hidden window it prints in has JavaScript switched off
 * (chromium-print.ts), so nothing in a stranger's document can run.
 */

import mammoth from 'mammoth';
import { wordIsInstalled } from './office-com';
import { ConvertFailedError, type ConvertEngine, type ConvertJob } from './types';

/** Close to Word's own defaults, so the result is at least familiar. */
const PAGE_STYLE = `<style>
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5;
         color: #000; margin: 0; }
  h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; }
  img { max-width: 100%; }
  p { margin: 0 0 8pt; }
</style>`;

async function run(job: ConvertJob): Promise<Uint8Array> {
  const rendered = await mammoth.convertToHtml({ path: job.filePath });
  if (rendered.value.trim().length === 0) {
    throw new ConvertFailedError(
      `${job.fileName} came back with no readable content. If it is an older .doc file, open it ` +
        'in Word once and save it as .docx.'
    );
  }
  const { printHtml } = await import('./chromium-print');
  return printHtml(
    `<!doctype html><meta charset="utf-8"><title>${job.fileName}</title>${PAGE_STYLE}${rendered.value}`,
    job.fileName
  );
}

export const BUILTIN_WORD_ENGINE: ConvertEngine = {
  id: 'builtin-word',
  label: 'Built-in Word converter',
  extensions: ['.docx'],
  note: (available) =>
    available
      ? 'Microsoft Word is not installed on this computer, so Word documents are converted by the ' +
        'built-in converter. It keeps the text, headings, lists, tables and pictures, but not ' +
        "Word's exact page breaks, fonts, or pleading-paper line numbers."
      : 'Not needed on this computer — Microsoft Word is installed and does the conversion itself.',
  available: async () => !(await wordIsInstalled()),
  run,
};

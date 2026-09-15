/**
 * The converter Legion PDF always has: Chromium, already in the box.
 *
 * A hidden BrowserWindow loads a page and prints it. That is how .html files
 * open without Word, how a .docx opens on a machine with no Office at all (see
 * builtin-word.ts), and how a picture format Electron cannot decode still makes
 * it onto a page.
 *
 * IMPORT RULE (#seam:convert-electron-lazy): this module and nothing else in the
 * convert service reaches for `electron` at load time, and every caller pulls it
 * in with `await import('./chromium-print')`. That is what keeps the registry,
 * the Office engines, and the image and text paths runnable — and testable — in
 * plain Node.
 *
 * JavaScript is switched OFF in the hidden window, and every asset is inlined as
 * a data: URI rather than left as a file:// reference. A converted document is
 * someone else's file: it must render, not run, and not reach for anything else
 * on the disk.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { withTempDir } from './temp-workspace';
import { ConvertFailedError } from './types';

/** A page that will not finish loading must not hold the app open forever. */
const LOAD_TIMEOUT_MS = 60_000;

const PRINT_OPTIONS = {
  pageSize: 'Letter',
  margins: { marginType: 'default' },
  printBackground: true,
} as const;

function deadline(label: string): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new ConvertFailedError(`${label} took too long to lay out and was stopped.`)),
      LOAD_TIMEOUT_MS
    );
  });
}

async function printLoadedPage(filePath: string, label: string): Promise<Uint8Array> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  try {
    const timeout = deadline(label);
    await Promise.race([window.loadFile(filePath), timeout]);
    const pdf = await Promise.race([window.webContents.printToPDF(PRINT_OPTIONS), timeout]);
    return new Uint8Array(pdf);
  } finally {
    window.destroy();
  }
}

/** Prints an HTML file already on disk (a .html the attorney chose to open). */
export function printHtmlFile(filePath: string, label: string): Promise<Uint8Array> {
  return printLoadedPage(filePath, label);
}

/** Prints HTML we generated, from a temp file that is removed either way. */
export function printHtml(html: string, label: string): Promise<Uint8Array> {
  return withTempDir('html', async (directory) => {
    const page = join(directory, 'page.html');
    await writeFile(page, html, 'utf8');
    return printLoadedPage(page, label);
  });
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

/**
 * Last resort for a picture: let Chromium decode it. BMP, GIF and WebP are all
 * formats the browser engine reads natively even where Electron's own
 * `nativeImage` hands back an empty image.
 */
export function printImage(
  bytes: Uint8Array,
  mediaType: string,
  label: string
): Promise<Uint8Array> {
  const source = `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`;
  return printHtml(
    `<!doctype html><meta charset="utf-8"><title>${escapeText(label)}</title>` +
      '<style>@page{margin:0}html,body{margin:0;height:100%}' +
      'body{display:flex;align-items:center;justify-content:center}' +
      'img{max-width:100%;max-height:100vh}</style>' +
      `<img src="${source}" alt="">`,
    label
  );
}

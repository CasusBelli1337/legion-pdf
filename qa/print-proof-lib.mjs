/**
 * Shared plumbing for the print page-count proof.
 *
 * WHY this exists: the print bug ("said 15 pages, printed ~30") is invisible to
 * unit tests, because it only happens inside a real paginating print engine.
 * The only honest proof is to hand the real print sheet to Chromium's own
 * engine (`webContents.printToPDF`) and count the sheets that come back.
 *
 * The system print dialog is replaced, not driven: the `app:print` IPC handler
 * is re-registered in the main process to hang forever, so the renderer builds
 * the sheet and then waits — which is exactly the state the printer sees, minus
 * a modal dialog nothing can click in a headless WSL session.
 */
import { _electron as electron } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The evaluate callbacks below run inside the app's renderer, not in node.
/* global document */

export const APP_DIR = path.resolve(import.meta.dirname, '..');
export const WORK_DIR = process.env.DRIVER_WORK_DIR || '/tmp/legion-pdf-driver-print';

export async function launchApp(files = []) {
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
    args: [
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${path.join(WORK_DIR, 'udata')}`,
      APP_DIR,
      ...files,
    ],
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/**
 * Make `app:print` hang instead of opening the OS dialog. Without this the
 * renderer's `finally` tears the sheet down the instant the dialog fails on a
 * printer-less machine, and there is nothing left to print.
 */
export async function stubPrintDialog(app) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('app:print');
    ipcMain.handle('app:print', () => new Promise(() => {}));
  });
}

/**
 * Print the app window through Chromium and write the PDF. Returns its bytes.
 * The PDF comes back base64-encoded because the main-process evaluate runs in a
 * context with no `require` and no dynamic import, so it cannot write the file
 * itself.
 */
export async function printToPdf(app, outPath, options = {}) {
  const encoded = await app.evaluate(
    async ({ BrowserWindow }, args) => {
      const win = BrowserWindow.getAllWindows()[0];
      const data = await win.webContents.printToPDF({
        margins: { marginType: 'none' },
        printBackground: true,
        ...args.options,
      });
      return data.toString('base64');
    },
    { options }
  );
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0) throw new Error(`printToPDF produced an empty file: ${outPath}`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  return bytes;
}

/** Sheet count and first-sheet size of a printed PDF, in points. */
export async function measure(bytes) {
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPage(0).getSize();
  return {
    sheets: doc.getPageCount(),
    paper: `${Math.round(width)}x${Math.round(height)}pt`,
  };
}

/** Click a toolbar button by its `title` (every one carries the shortcut). */
export async function clickByTitle(page, title) {
  const found = await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('button')].find((el) =>
      (el.title || '').startsWith(wanted)
    );
    if (!button) return false;
    button.click();
    return true;
  }, title);
  if (!found) throw new Error(`No toolbar button whose title starts with "${title}"`);
}

/** Wait until the hidden print sheet holds exactly `expected` page images. */
export async function waitForSheet(page, expected, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = await page.evaluate(
      () => document.querySelectorAll('#librarius-print-sheet img').length
    );
    if (seen === expected) return seen;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Print sheet stalled at ${seen} of ${expected} page images`);
}

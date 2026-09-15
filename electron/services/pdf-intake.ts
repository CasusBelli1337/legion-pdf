/**
 * The one door PDF bytes pass through on their way in from disk. Encrypted
 * files (court forms above all) are decrypted here, once, so the doc store,
 * every core op, and the renderer only ever see bytes the whole engine can
 * parse. A file locked with a real user password refuses loudly instead.
 *
 * It is also where a file that is NOT a PDF becomes one. `readOpenableFile` is
 * what `file:open` and `ops:merge` call, so a .docx or a .png is converted on
 * the way in and every stage downstream still only ever handles PDF bytes.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { decryptPdf, isEncrypted } from '@core/decrypt/qpdf';
import { isPdfPath } from '@shared/convert-inputs';

const require = createRequire(import.meta.url);

let wasmBinary: Uint8Array | null = null;

/** The qpdf wasm ships inside node_modules, which the installer packages. */
async function qpdfWasm(): Promise<Uint8Array> {
  if (wasmBinary === null) {
    wasmBinary = new Uint8Array(await readFile(require.resolve('@jspawn/qpdf-wasm/qpdf.wasm')));
  }
  return wasmBinary;
}

/** Decrypts encrypted bytes; hands unencrypted bytes back untouched. */
export async function normalizePdfBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isEncrypted(bytes)) return bytes;
  return decryptPdf(bytes, await qpdfWasm());
}

/** Read a PDF off disk, decrypted and ready for every consumer downstream. */
export async function readPdfFile(filePath: string): Promise<Uint8Array> {
  return normalizePdfBytes(new Uint8Array(await readFile(filePath)));
}

/**
 * PDF bytes for any file Legion PDF can open — a real PDF read straight off
 * disk, or anything else converted into one first.
 *
 * The convert service is imported lazily on purpose: it reaches Electron's
 * BrowserWindow and nativeImage for some formats, and the PDF path must stay
 * runnable (and unit-testable) in plain Node.
 */
export async function readOpenableFile(filePath: string): Promise<Uint8Array> {
  if (isPdfPath(filePath)) return readPdfFile(filePath);
  const { convertToPdf } = await import('./convert');
  return (await convertToPdf(filePath)).bytes;
}

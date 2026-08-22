/**
 * Removes PDF encryption so the rest of core/ can work on the bytes.
 *
 * Court forms — California Judicial Council forms above all — ship encrypted
 * with an owner password only: every viewer opens them, but pdf-lib cannot
 * parse their encrypted object streams even with `ignoreEncryption`, so the
 * app could not open them at all. qpdf (compiled to WebAssembly, Apache-2.0)
 * strips that encryption losslessly. Files locked with a real user password
 * stay closed and fail loudly — guessing at content is worse than refusing.
 *
 * Pure over Uint8Array: the wasm binary is injected by the caller so this
 * module needs no filesystem of its own.
 */

import createQpdfModule from '@jspawn/qpdf-wasm/qpdf.js';
import { PDFDocument } from 'pdf-lib';

/** The file demands a password we do not have; only the user can supply it. */
export class PasswordProtectedError extends Error {
  readonly code = 'PASSWORD_PROTECTED';
  constructor() {
    super(
      'This PDF is locked with a password. Legion PDF cannot open it without the password, and password entry is not built yet.'
    );
    this.name = 'PasswordProtectedError';
  }
}

/** qpdf ran and failed, or produced bytes no PDF reader accepts. */
export class DecryptionFailedError extends Error {
  readonly code = 'DECRYPT_FAILED';
  constructor(detail: string) {
    super(`The PDF is encrypted and could not be unlocked: ${detail}`);
    this.name = 'DecryptionFailedError';
  }
}

const ENCRYPT_TOKEN = Uint8Array.from('/Encrypt', (c) => c.charCodeAt(0));

/**
 * Whether the bytes carry an /Encrypt dictionary reference. A false positive
 * (the token appearing in ordinary content) is harmless — qpdf passes an
 * unencrypted file through unchanged — so a plain byte scan is enough.
 */
export function isEncrypted(bytes: Uint8Array): boolean {
  const limit = bytes.length - ENCRYPT_TOKEN.length;
  for (let at = 0; at <= limit; at += 1) {
    if (bytes[at] !== ENCRYPT_TOKEN[0]) continue;
    let hit = true;
    for (let offset = 1; offset < ENCRYPT_TOKEN.length; offset += 1) {
      if (bytes[at + offset] !== ENCRYPT_TOKEN[offset]) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}

export const QPDF_INPUT = '/input.pdf';
export const QPDF_OUTPUT = '/output.pdf';

/** qpdf exit statuses: 0 clean, 3 succeeded with warnings. Anything else failed. */
const QPDF_OK = 0;
const QPDF_WARNINGS = 3;

/** `--requires-password` answers 3 for "encrypted but opens without one". */
const OPENS_WITHOUT_PASSWORD = 3;

/**
 * Run one qpdf invocation in a fresh wasm instance (the module holds global
 * state, so instances are never reused). The input bytes are mounted at
 * QPDF_INPUT; args reference QPDF_INPUT/QPDF_OUTPUT explicitly. Exported for
 * tests, which use it to BUILD encrypted fixtures with `--encrypt` — the same
 * tool proves both directions.
 */
export async function runQpdf(
  wasmBinary: Uint8Array,
  args: readonly string[],
  input: Uint8Array
): Promise<{ exitCode: number; output: Uint8Array | null; stderr: string[] }> {
  const stderr: string[] = [];
  const qpdf = await createQpdfModule({
    noInitialRun: true,
    instantiateWasm: (imports, done) => {
      void WebAssembly.instantiate(wasmBinary, imports).then((result) => done(result.instance));
      return {};
    },
    print: () => {},
    printErr: (line) => stderr.push(line),
  });
  qpdf.FS.writeFile(QPDF_INPUT, input);
  const exitCodeBefore = typeof process === 'undefined' ? undefined : process.exitCode;
  let exitCode: number;
  try {
    exitCode = qpdf.callMain([...args]);
  } finally {
    // Emscripten mirrors callMain's status onto process.exitCode; left in
    // place it would turn the host app's own clean quit into a failure code.
    if (typeof process !== 'undefined') process.exitCode = exitCodeBefore;
  }
  let output: Uint8Array | null = null;
  try {
    output = qpdf.FS.readFile(QPDF_OUTPUT);
  } catch {
    // No output file — the caller sees exitCode and stderr instead.
  }
  return { exitCode, output, stderr };
}

/**
 * Decrypt `bytes` with an empty password and prove the result still parses as
 * a PDF with at least one page. Owner-password-only files (the court-form
 * case) decrypt without any password; a file that needs a real user password
 * raises PasswordProtectedError.
 */
export async function decryptPdf(bytes: Uint8Array, wasmBinary: Uint8Array): Promise<Uint8Array> {
  const { exitCode, output, stderr } = await runQpdf(
    wasmBinary,
    ['--decrypt', QPDF_INPUT, QPDF_OUTPUT],
    bytes
  );
  if (exitCode !== QPDF_OK && exitCode !== QPDF_WARNINGS) {
    await refuseByCause(bytes, wasmBinary, exitCode, stderr);
  }
  if (output === null || output.byteLength === 0) {
    throw new DecryptionFailedError('the unlocked file came back empty.');
  }
  await assertParsablePdf(output);
  return output;
}

/**
 * Decrypt failed — name the reason. The wrong-password message is not
 * capturable from this wasm build (it bypasses printErr), so the probe
 * `--requires-password` answers instead: anything but "opens without a
 * password" on a file we know is encrypted means a real user password.
 */
async function refuseByCause(
  bytes: Uint8Array,
  wasmBinary: Uint8Array,
  exitCode: number,
  stderr: string[]
): Promise<never> {
  const probe = await runQpdf(wasmBinary, ['--requires-password', QPDF_INPUT], bytes);
  if (probe.exitCode !== OPENS_WITHOUT_PASSWORD && isEncrypted(bytes)) {
    throw new PasswordProtectedError();
  }
  throw new DecryptionFailedError(stderr.at(-1) ?? `qpdf exited with status ${exitCode}.`);
}

/** The decrypted bytes must open in the engine that motivated the decrypt. */
async function assertParsablePdf(bytes: Uint8Array): Promise<void> {
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    if (document.getPageCount() < 1) {
      throw new Error('zero pages');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new DecryptionFailedError(`the unlocked file does not parse as a PDF (${reason}).`);
  }
}

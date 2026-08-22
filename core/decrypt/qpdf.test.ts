import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { countPages } from '../pdf-meta';
import { labelledPages, makeTestPdf } from '../ops/test-fixtures';
import {
  PasswordProtectedError,
  QPDF_INPUT,
  QPDF_OUTPUT,
  decryptPdf,
  isEncrypted,
  runQpdf,
} from './qpdf';

const require = createRequire(import.meta.url);
const wasmBinary = new Uint8Array(readFileSync(require.resolve('@jspawn/qpdf-wasm/qpdf.wasm')));

/**
 * Encrypts a fixture the way Judicial Council forms are built: object streams
 * plus encryption, which is exactly the combination pdf-lib cannot parse.
 * An empty user password mirrors the court forms; a real one locks the file.
 */
async function encryptFixture(pages: number, userPassword: string): Promise<Uint8Array> {
  const plain = await makeTestPdf({ pages: labelledPages(pages) });
  const { exitCode, output } = await runQpdf(
    wasmBinary,
    [
      '--encrypt',
      userPassword,
      'owner-secret',
      '256',
      '--',
      '--object-streams=generate',
      QPDF_INPUT,
      QPDF_OUTPUT,
    ],
    plain
  );
  expect(exitCode).toBe(0);
  if (output === null) throw new Error('encrypting the fixture produced no output');
  return output;
}

describe('isEncrypted', () => {
  it('sees the /Encrypt dictionary in an encrypted file', async () => {
    expect(isEncrypted(await encryptFixture(2, ''))).toBe(true);
  });

  it('reports a plain PDF as not encrypted', async () => {
    expect(isEncrypted(await makeTestPdf({ pages: labelledPages(2) }))).toBe(false);
  });
});

describe('decryptPdf', () => {
  it('unlocks an owner-password-only file into bytes pdf-lib can parse', async () => {
    const encrypted = await encryptFixture(3, '');
    const decrypted = await decryptPdf(encrypted, wasmBinary);
    expect(isEncrypted(decrypted)).toBe(false);
    expect(await countPages(decrypted)).toBe(3);
  }, 30_000);

  it('refuses a file locked with a real user password, loudly and by name', async () => {
    const locked = await encryptFixture(2, 'real-user-password');
    await expect(decryptPdf(locked, wasmBinary)).rejects.toThrow(PasswordProtectedError);
  }, 30_000);

  it('passes an unencrypted file through unchanged in content', async () => {
    const plain = await makeTestPdf({ pages: labelledPages(2) });
    const passedThrough = await decryptPdf(plain, wasmBinary);
    expect(await countPages(passedThrough)).toBe(2);
  }, 30_000);
});

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { countPages } from '@core/pdf-meta';
import { QPDF_INPUT, QPDF_OUTPUT, isEncrypted, runQpdf } from '@core/decrypt/qpdf';
import { labelledPages, makeTestPdf } from '@core/ops/test-fixtures';
import { readPdfFile } from './pdf-intake';

const require = createRequire(import.meta.url);

async function writeTemp(name: string, bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'pdf-intake-'));
  const filePath = join(directory, name);
  await writeFile(filePath, bytes);
  return filePath;
}

describe('readPdfFile', () => {
  it('hands a plain PDF back exactly as it is on disk', async () => {
    const plain = await makeTestPdf({ pages: labelledPages(2) });
    const bytes = await readPdfFile(await writeTemp('plain.pdf', plain));
    expect(bytes).toEqual(plain);
  });

  it('decrypts an owner-password-encrypted PDF on the way in', async () => {
    const wasmBinary = new Uint8Array(
      await readFile(require.resolve('@jspawn/qpdf-wasm/qpdf.wasm'))
    );
    const plain = await makeTestPdf({ pages: labelledPages(3) });
    const { exitCode, output } = await runQpdf(
      wasmBinary,
      ['--encrypt', '', 'owner-secret', '256', '--', QPDF_INPUT, QPDF_OUTPUT],
      plain
    );
    expect(exitCode).toBe(0);
    if (output === null) throw new Error('encrypting the fixture produced no output');

    const bytes = await readPdfFile(await writeTemp('locked.pdf', output));
    expect(isEncrypted(bytes)).toBe(false);
    expect(await countPages(bytes)).toBe(3);
  }, 30_000);
});

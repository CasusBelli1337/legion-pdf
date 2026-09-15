/**
 * END TO END, against the REAL Microsoft Word on the Windows host.
 *
 * The fixture is a genuine .docx written here with the `docx` package (no binary
 * fixtures in git, and the parties are fictional — this repository is public),
 * handed to the very COM script the product ships, and the PDF that comes back
 * is re-opened and counted. When poppler is also present the text is pulled back
 * out, which is the only way to prove the attorney's words actually survived the
 * round trip rather than a blank page coming back.
 *
 * Under WSL this reaches Windows Word through interop; on a machine with neither
 * PowerShell nor Word the suite skips itself, loudly named. Windows coverage is
 * the live QA pass.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { OFFICE_ENGINES } from './office-com';
import { resolvePowerShell, toWindowsPath } from './windows-shell';

const CAPTION = 'ASHFORD HOLDINGS, LLC v. REDFERN LOGISTICS CORP.';
const BODY = [
  'Plaintiff respectfully submits this memorandum in support of its motion to',
  'compel further responses to the second set of requests for production.',
];

/** COM asks the registry whether Word exists; so does the product. */
function wordIsReachable(): boolean {
  const shell = resolvePowerShell();
  if (shell === null) return false;
  const probe = spawnSync(
    shell,
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Test-Path "HKLM:\\SOFTWARE\\Classes\\Word.Application") -or ' +
        '(Test-Path "HKCU:\\SOFTWARE\\Classes\\Word.Application")',
    ],
    { encoding: 'utf8', timeout: 30_000 }
  );
  return probe.status === 0 && probe.stdout.trim().toLowerCase() === 'true';
}

function canSpawn(command: string, args: string[]): boolean {
  return spawnSync(command, args, { encoding: 'utf8' }).error === undefined;
}

const WORD_PRESENT = wordIsReachable();

/** The shipping engine, looked up by id so a rename fails here rather than silently. */
function wordEngine() {
  const engine = OFFICE_ENGINES.find((item) => item.id === 'word');
  if (engine === undefined) throw new Error('The word engine is missing from OFFICE_ENGINES.');
  return engine;
}

let workspace = '';

async function fictionalBrief(): Promise<Uint8Array> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: CAPTION, heading: HeadingLevel.HEADING_1 }),
          ...BODY.map((line) => new Paragraph({ children: [new TextRun(line)] })),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

/** Text back out of the finished PDF, or null when poppler is not installed. */
function extractText(pdfPath: string): string | null {
  if (!canSpawn('pdftotext', ['-v'])) return null;
  const result = spawnSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-word-e2e-'));
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

describe.skipIf(!WORD_PRESENT)('Word documents through the real Microsoft Word', () => {
  it('reports itself available on a computer that has Word', async () => {
    expect(await wordEngine().available()).toBe(true);
  });

  it('converts a .docx and keeps the words that were in it', async () => {
    const filePath = join(workspace, 'motion-to-compel.docx');
    await writeFile(filePath, await fictionalBrief());

    const bytes = await wordEngine().run({
      filePath,
      fileName: 'motion-to-compel.docx',
      extension: '.docx',
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const pdfPath = join(workspace, 'round-trip.pdf');
    await writeFile(pdfPath, bytes);
    const text = extractText(pdfPath);
    if (text !== null) {
      expect(text.toUpperCase()).toContain('ASHFORD HOLDINGS');
      expect(text).toContain('requests for production');
    }
  }, 180_000);

  it('fails out loud on a file Word cannot open, rather than returning nothing', async () => {
    const filePath = join(workspace, 'corrupt.docx');
    await writeFile(filePath, new TextEncoder().encode('this is not a Word document at all'));

    await expect(
      wordEngine().run({ filePath, fileName: 'corrupt.docx', extension: '.docx' })
    ).rejects.toThrow(/could not convert corrupt\.docx/i);
  }, 180_000);

  it('hands Word a path Windows can actually open', async () => {
    const translated = toWindowsPath(join(workspace, 'motion-to-compel.docx'));
    expect(translated).toMatch(/^[A-Za-z]:\\|^\\\\/);
  });
});

describe.skipIf(WORD_PRESENT)('Word documents through the real Microsoft Word', () => {
  it.skip('needs PowerShell and Microsoft Word — covered by the Windows live QA pass', () => {
    expect(WORD_PRESENT).toBe(false);
  });
});

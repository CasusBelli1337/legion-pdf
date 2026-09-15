/**
 * The half of the no-Word fallback that can be tested without a window.
 *
 * `wordDocumentHtml` is where the .docx is actually read, and it is also where
 * the one runtime trap lives: mammoth is CommonJS, so the ESM import has to take
 * its `default`. Getting that wrong shows up as `convertToHtml is not a
 * function` on a machine with no Word — the exact machine nobody tests on. The
 * fixture is a real .docx built here with the `docx` package, with fictional
 * parties (this repository is public).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { BUILTIN_WORD_ENGINE, wordDocumentHtml } from './builtin-word';

const CAPTION = 'ASHFORD HOLDINGS, LLC v. REDFERN LOGISTICS CORP.';
const BODY = 'Plaintiff moves to compel further responses to the second set of requests.';

let workspace = '';

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-builtin-word-'));
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

async function seedDocx(name: string): Promise<string> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: CAPTION, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun(BODY)] }),
        ],
      },
    ],
  });
  const filePath = join(workspace, name);
  await writeFile(filePath, await Packer.toBuffer(document));
  return filePath;
}

describe('the built-in Word converter', () => {
  it('only claims .docx — older Word files still need Word itself', () => {
    expect([...BUILTIN_WORD_ENGINE.extensions]).toEqual(['.docx']);
  });

  it('reads a real .docx into HTML that keeps the words and the heading', async () => {
    const filePath = await seedDocx('motion.docx');

    const html = await wordDocumentHtml({
      filePath,
      fileName: 'motion.docx',
      extension: '.docx',
    });

    expect(html).toContain(CAPTION);
    expect(html).toContain(BODY);
    expect(html).toMatch(/<h1>/);
    expect(html).toContain('<title>motion.docx</title>');
  });

  it('refuses a file that reads as nothing, and says what to do about it', async () => {
    const filePath = join(workspace, 'not-really.docx');
    await writeFile(filePath, 'this is not a Word document');

    await expect(
      wordDocumentHtml({ filePath, fileName: 'not-really.docx', extension: '.docx' })
    ).rejects.toThrow();
  });
});

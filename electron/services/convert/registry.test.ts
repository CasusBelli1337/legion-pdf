/**
 * The routing table, against the real engine objects.
 *
 * Only the Windows shell is stubbed — which Office apps the registry is told
 * about — because that is the one thing that differs between the attorney's
 * laptop and this one. Everything else (the engine list, the order, the
 * fall-through, the wording of the failures) is the shipping code.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ installed: [] as string[], probes: 0 }));

vi.mock('./windows-shell', () => ({
  resolvePowerShell: () => 'powershell.exe',
  probePowerShell: () => {
    shell.probes += 1;
    return Promise.resolve(shell.installed.join('\r\n'));
  },
  toWindowsPath: (path: string) => path,
  psQuote: (value: string) => `'${value}'`,
  runPowerShellFile: () => Promise.reject(new Error('not used in this suite')),
}));

const { resetOfficeCache } = await import('./office-com');
const { convertSupport, engineForPath, resetAvailabilityCache } = await import('./registry');

const WORD = 'Word.Application';
const EXCEL = 'Excel.Application';
const POWERPOINT = 'PowerPoint.Application';

function officeInstalled(...progIds: string[]): void {
  shell.installed = progIds;
  shell.probes = 0;
  resetOfficeCache();
  resetAvailabilityCache();
}

beforeEach(() => officeInstalled());

describe('engineForPath with Microsoft Office installed', () => {
  beforeEach(() => officeInstalled(WORD, EXCEL, POWERPOINT));

  it('sends Word documents to Word, not the built-in converter', async () => {
    expect((await engineForPath('C:/matters/letter.docx')).id).toBe('word');
    expect((await engineForPath('C:/matters/old.doc')).id).toBe('word');
    expect((await engineForPath('C:/matters/memo.rtf')).id).toBe('word');
  });

  it('sends plain text and web pages to Word too, because its output is familiar', async () => {
    expect((await engineForPath('/notes.txt')).id).toBe('word');
    expect((await engineForPath('/saved.html')).id).toBe('word');
  });

  it('sends spreadsheets and decks to their own program', async () => {
    expect((await engineForPath('/exhibits.xlsx')).id).toBe('excel');
    expect((await engineForPath('/damages.xls')).id).toBe('excel');
    expect((await engineForPath('/opening.pptx')).id).toBe('powerpoint');
    expect((await engineForPath('/opening.ppt')).id).toBe('powerpoint');
  });

  it('never sends a picture to Office', async () => {
    for (const path of ['/a.png', '/a.jpg', '/a.jpeg', '/a.tif', '/a.tiff', '/a.bmp', '/a.gif']) {
      expect((await engineForPath(path)).id).toBe('image');
    }
  });

  it('asks the registry once, however many files are opened', async () => {
    await engineForPath('/one.docx');
    await engineForPath('/two.xlsx');
    await engineForPath('/three.pptx');

    expect(shell.probes).toBe(1);
  });
});

describe('engineForPath without Microsoft Office', () => {
  it('falls through to the built-in converter for .docx', async () => {
    expect((await engineForPath('/letter.docx')).id).toBe('builtin-word');
  });

  it('falls through to the built-in text converter for .txt and .html', async () => {
    expect((await engineForPath('/notes.txt')).id).toBe('text');
    expect((await engineForPath('/page.htm')).id).toBe('text');
  });

  it('explains what to do about an older .doc instead of failing silently', async () => {
    await expect(engineForPath('/old.doc')).rejects.toThrow(
      /Microsoft Word, which is not installed/i
    );
  });

  it('explains what to do about a spreadsheet', async () => {
    await expect(engineForPath('/exhibits.xlsx')).rejects.toThrow(/Microsoft Excel/i);
  });

  it('explains what to do about a slide deck', async () => {
    await expect(engineForPath('/opening.pptx')).rejects.toThrow(/Microsoft PowerPoint/i);
  });

  it('still opens pictures and text — nothing needs installing for those', async () => {
    expect((await engineForPath('/scan.tiff')).id).toBe('image');
    expect((await engineForPath('/log.txt')).id).toBe('text');
  });
});

describe('engineForPath on a file type nothing claims', () => {
  it('names the extension it cannot open', async () => {
    await expect(engineForPath('/archive.xyz')).rejects.toThrow(/cannot open \.xyz files/i);
  });

  it('says so plainly when there is no extension at all', async () => {
    await expect(engineForPath('/mystery')).rejects.toThrow(/no file extension/i);
  });

  it('refuses a PDF, which never belongs here', async () => {
    await expect(engineForPath('/brief.pdf')).rejects.toThrow(/cannot open \.pdf files/i);
  });
});

describe('convertSupport', () => {
  it('reports every engine, and the extensions that actually work here', async () => {
    officeInstalled(WORD);
    const support = await convertSupport();

    expect(support.engines.map((engine) => engine.id)).toEqual([
      'word',
      'excel',
      'powerpoint',
      'builtin-word',
      'image',
      'text',
    ]);
    expect(support.extensions).toContain('.docx');
    expect(support.extensions).toContain('.doc');
    expect(support.extensions).toContain('.png');
    expect(support.extensions).not.toContain('.xlsx');
    expect(support.extensions).not.toContain('.pptx');
  });

  it('says plainly that the built-in converter is standing in for Word', async () => {
    officeInstalled();
    const support = await convertSupport();
    const builtin = support.engines.find((engine) => engine.id === 'builtin-word');

    expect(builtin?.available).toBe(true);
    expect(builtin?.note).toMatch(/Microsoft Word is not installed/i);
    expect(builtin?.note).toMatch(/page breaks|fonts/i);
  });

  it('steps aside when Word is installed', async () => {
    officeInstalled(WORD);
    const support = await convertSupport();
    const builtin = support.engines.find((engine) => engine.id === 'builtin-word');

    expect(builtin?.available).toBe(false);
    expect(builtin?.note).toMatch(/Microsoft Word is installed/i);
  });

  it('lists pictures and text as available on any computer', async () => {
    officeInstalled();
    const support = await convertSupport();

    expect(support.engines.find((engine) => engine.id === 'image')?.available).toBe(true);
    expect(support.engines.find((engine) => engine.id === 'text')?.available).toBe(true);
    expect(support.extensions).toEqual([...support.extensions].sort());
  });
});

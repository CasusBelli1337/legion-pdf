import { describe, expect, it } from 'vitest';
import { claimPageFiles, fileStem, pageFileName, padWidth } from './output-naming';

const never = (): Promise<boolean> => Promise.resolve(false);

describe('names for a batch of page images', () => {
  it('drops the .pdf and keeps the rest of the attorney’s file name', () => {
    expect(fileStem('Ashford Deposition.pdf')).toBe('Ashford Deposition');
    expect(fileStem('/matters/2026/Exhibit 12.PDF')).toBe('Exhibit 12');
    expect(fileStem('no-extension')).toBe('no-extension');
  });

  it('pads to at least three digits, the way productions number pages', () => {
    expect(padWidth(8)).toBe(3);
    expect(padWidth(500)).toBe(3);
    expect(padWidth(1200)).toBe(4);
    expect(pageFileName('Depo', 7, 3, 'png')).toBe('Depo-page-007.png');
    expect(pageFileName('Depo', 1200, 4, 'tif')).toBe('Depo-page-1200.tif');
  });

  it('sorts by name in the same order the pages come in', async () => {
    const { files, note } = await claimPageFiles(
      { folder: '/out', stem: 'Depo', pages: [9, 10, 11], extension: 'png', pageCount: 11 },
      never
    );
    expect(files).toEqual([
      '/out/Depo-page-009.png',
      '/out/Depo-page-010.png',
      '/out/Depo-page-011.png',
    ]);
    expect([...files].sort()).toEqual(files);
    expect(note).toBeNull();
  });
});

describe('not overwriting what is already there', () => {
  it('moves the WHOLE batch aside when any one name is taken', async () => {
    const taken = new Set(['/out/Depo-page-003.png']);
    const { files, note } = await claimPageFiles(
      { folder: '/out', stem: 'Depo', pages: [1, 2, 3], extension: 'png', pageCount: 3 },
      (path) => Promise.resolve(taken.has(path))
    );
    expect(files).toEqual([
      '/out/Depo (2)-page-001.png',
      '/out/Depo (2)-page-002.png',
      '/out/Depo (2)-page-003.png',
    ]);
    expect(note).toMatch(/was saved as "Depo \(2\)-page-\.\.\."/);
  });

  it('keeps counting past a folder that already holds several sets', async () => {
    const taken = new Set(['/out/Depo-page-001.png', '/out/Depo (2)-page-001.png']);
    const { files } = await claimPageFiles(
      { folder: '/out', stem: 'Depo', pages: [1], extension: 'png', pageCount: 1 },
      (path) => Promise.resolve(taken.has(path))
    );
    expect(files).toEqual(['/out/Depo (3)-page-001.png']);
  });

  it('gives up loudly rather than looping forever', async () => {
    await expect(
      claimPageFiles(
        { folder: '/out', stem: 'Depo', pages: [1], extension: 'png', pageCount: 1 },
        () => Promise.resolve(true)
      )
    ).rejects.toThrow(/Choose a different folder/);
  });
});

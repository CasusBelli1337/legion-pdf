import { describe, expect, it } from 'vitest';
import type { ExportResult } from '@shared/types';
import {
  containingFolder,
  destinationSummary,
  exportButtonLabel,
  fileNameOf,
  receiptText,
  showInFolderTarget,
  suggestedName,
} from './export-messages';

describe('paths, without a path module', () => {
  it('finds the folder and the file on both kinds of separator', () => {
    expect(containingFolder('/home/a/out/Depo-page-001.png')).toBe('/home/a/out');
    expect(containingFolder('C:\\Matters\\Ashford\\Depo.tif')).toBe('C:\\Matters\\Ashford');
    expect(fileNameOf('/home/a/out/Depo-page-001.png')).toBe('Depo-page-001.png');
    expect(fileNameOf('C:\\Matters\\Depo.tif')).toBe('Depo.tif');
  });

  it('leaves a bare name alone rather than inventing a folder', () => {
    expect(containingFolder('Depo.tif')).toBe('Depo.tif');
    expect(fileNameOf('Depo.tif')).toBe('Depo.tif');
  });
});

describe('suggestedName', () => {
  it('keeps the document name and swaps the ending for the format', () => {
    expect(suggestedName('Ashford Deposition.pdf', 'tiff')).toBe('Ashford Deposition.tif');
    expect(suggestedName('Ashford Deposition.pdf', 'txt')).toBe('Ashford Deposition.txt');
    expect(suggestedName('Ashford Deposition.pdf', 'jpeg')).toBe('Ashford Deposition.jpg');
  });

  it('still answers something usable for a document with no name', () => {
    expect(suggestedName('', 'txt')).toBe('Export.txt');
  });
});

describe('what the panel says before and after a run', () => {
  it('names the destination in the words that match the format', () => {
    expect(destinationSummary('png', null)).toBe('No location chosen yet.');
    expect(destinationSummary('png', '/out/images')).toBe('The pages go into /out/images');
    expect(destinationSummary('tiff', '/out/Depo.tif')).toBe('Saves as /out/Depo.tif');
  });

  it('says exactly what the button will do', () => {
    expect(exportButtonLabel('png', 65)).toBe('Export 65 pages as images');
    expect(exportButtonLabel('txt', 1)).toBe('Export 1 page as Plain text');
  });

  it('counts the files for a folder export and the pages for a single file', () => {
    const images: ExportResult = {
      format: 'png',
      files: ['/out/i/Depo-page-001.png', '/out/i/Depo-page-002.png'],
      pagesExported: 2,
      notes: [],
    };
    expect(receiptText(images)).toBe('Wrote 2 PNG files to /out/i');
    expect(showInFolderTarget(images)).toBe('/out/i');

    const tiff: ExportResult = {
      format: 'tiff',
      files: ['/out/Depo.tif'],
      pagesExported: 65,
      notes: [],
    };
    expect(receiptText(tiff)).toBe('Wrote Depo.tif (65 pages)');
    expect(showInFolderTarget(tiff)).toBe('/out');
  });
});

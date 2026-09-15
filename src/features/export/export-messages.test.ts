import { describe, expect, it } from 'vitest';
import type { ExportResult } from '@shared/types';
import {
  PLAN_LOADING,
  RECEIPT_DROPPED_LABEL,
  RECEIPT_KEPT_LABEL,
  SCAN_PICTURE_HINTS,
  SCAN_PICTURE_OPTIONS,
  containingFolder,
  destinationSummary,
  exportButtonLabel,
  extraNotes,
  fileNameOf,
  plainExportError,
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

describe('plainExportError', () => {
  it('strips Electron plumbing AND the error class name', () => {
    const wrapped = new Error(
      "Error invoking remote method 'export:run': ExportCancelledError: " +
        'Export was stopped after page 5. 5 files were kept.'
    );
    expect(plainExportError(wrapped)).toBe('Export was stopped after page 5. 5 files were kept.');
  });

  it('turns the not-built-yet convention into a sentence for the attorney', () => {
    const wrapped = new Error(
      "Error invoking remote method 'export:run': Error: NotImplemented: export docx"
    );
    expect(plainExportError(wrapped)).toBe(
      'Word document export is not ready yet. It arrives in a coming update — the other formats all work now.'
    );
  });

  it('leaves a sentence that was already plain alone', () => {
    expect(plainExportError(new Error('Choose where to save the export first.'))).toBe(
      'Choose where to save the export first.'
    );
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

describe('what the panel says about a Word export', () => {
  it('offers the three answers to "what about the scans" in plain English', () => {
    expect(SCAN_PICTURE_OPTIONS.map((option) => option.value)).toEqual([
      'omit',
      'behind',
      'appendix',
    ]);
    expect(SCAN_PICTURE_OPTIONS.map((option) => option.label)).toEqual([
      'Recognized text only',
      'Text with the scan behind it',
      'Text, with the scans in an appendix',
    ]);
    for (const option of SCAN_PICTURE_OPTIONS) {
      expect(SCAN_PICTURE_HINTS[option.value].length).toBeGreaterThan(20);
    }
  });

  it('says something while it works out the plan', () => {
    expect(PLAN_LOADING).toBe('Looking at the document…');
  });

  it('labels the two halves of the receipt the way an attorney would', () => {
    expect(RECEIPT_KEPT_LABEL).toBe('Kept');
    expect(RECEIPT_DROPPED_LABEL).toBe('Left out');
  });

  it('never repeats a note the receipt already says', () => {
    const result: ExportResult = {
      format: 'docx',
      files: ['/out/Motion.docx'],
      pagesExported: 2,
      notes: ['Page 1 was a scan.', 'Bates numbers were left out.', 'Something else entirely.'],
      receipt: { kept: ['Page 1 was a scan.'], dropped: ['Bates numbers were left out.'] },
    };
    expect(extraNotes(result)).toEqual(['Something else entirely.']);
  });

  it('shows every note when the export had no receipt (the other formats)', () => {
    const result: ExportResult = {
      format: 'txt',
      files: ['/out/Depo.txt'],
      pagesExported: 1,
      notes: ['Page 4 was blank.'],
    };
    expect(extraNotes(result)).toEqual(['Page 4 was blank.']);
  });
});

/**
 * The words the bulk section says. A receipt that hides a failure, or calls an
 * already-searchable file "saved", is the bug these tests exist to stop.
 */

import { describe, expect, it } from 'vitest';
import type { BulkOcrFileResult } from '@shared/types';
import {
  bulkReceipt,
  chosenSummary,
  fileCounter,
  fileNameOf,
  fileOutcome,
  folderOf,
  isAlreadySearchable,
  liveStatusLabel,
  outputFolderLabel,
} from './bulk-ocr-messages';

function done(path: string, pages = 6, words = 240): BulkOcrFileResult {
  return {
    path,
    outputPath: `${path.replace(/\.pdf$/, '')} (searchable).pdf`,
    pages,
    words,
    status: 'done',
  };
}

const ALREADY: BulkOcrFileResult = {
  path: 'C:\\in\\typed.pdf',
  outputPath: null,
  pages: 0,
  words: 0,
  status: 'done',
};

const FAILED: BulkOcrFileResult = {
  path: 'C:\\in\\broken.pdf',
  outputPath: null,
  pages: 0,
  words: 0,
  status: 'failed',
  error: 'broken.pdf (searchable).pdf already exists.',
};

const CANCELLED: BulkOcrFileResult = {
  path: 'C:\\in\\later.pdf',
  outputPath: null,
  pages: 0,
  words: 0,
  status: 'cancelled',
};

describe('path copy', () => {
  it('names a Windows file and a WSL file alike', () => {
    expect(fileNameOf('C:\\Matters\\Ashford\\dep.pdf')).toBe('dep.pdf');
    expect(fileNameOf('/home/arthur/dep.pdf')).toBe('dep.pdf');
  });

  it('answers the folder a file sits in', () => {
    expect(folderOf('C:\\Matters\\Ashford\\dep.pdf')).toBe('C:\\Matters\\Ashford');
    expect(folderOf('dep.pdf')).toBe('');
  });

  it('says where the finished files go', () => {
    expect(outputFolderLabel(null)).toBe('Beside the original files');
    expect(outputFolderLabel('C:\\Out')).toBe('C:\\Out');
  });
});

describe('chosenSummary', () => {
  it.each([
    [[], 'No files chosen yet.'],
    [['a.pdf'], '1 file chosen.'],
    [['a.pdf', 'b.pdf'], '2 files chosen.'],
  ])('describes %o', (paths, expected) => {
    expect(chosenSummary(paths)).toBe(expected);
  });
});

describe('fileCounter', () => {
  it('counts files, not pages', () => {
    expect(fileCounter({ docId: null, phase: 'a.pdf — page 3 of 6', current: 2, total: 5 })).toBe(
      'File 2 of 5'
    );
  });

  it('says nothing before a run starts', () => {
    expect(fileCounter(null)).toBe('');
    expect(fileCounter({ docId: null, phase: '', current: 0, total: 0 })).toBe('');
  });
});

describe('liveStatusLabel', () => {
  it('never claims an outcome the run cannot know yet', () => {
    expect(liveStatusLabel('waiting')).toBe('Waiting');
    expect(liveStatusLabel('working')).toBe('Working');
    expect(liveStatusLabel('finished')).toBe('Finished');
  });
});

describe('fileOutcome', () => {
  it('reports the saved copy with its counts', () => {
    expect(fileOutcome(done('C:\\in\\scan.pdf'))).toBe(
      'Saved scan (searchable).pdf — 6 pages, 240 words.'
    );
  });

  it('says plainly that a searchable file was left alone', () => {
    expect(isAlreadySearchable(ALREADY)).toBe(true);
    expect(fileOutcome(ALREADY)).toBe('Already searchable — left alone.');
  });

  it('shows the reason a file failed', () => {
    expect(fileOutcome(FAILED)).toBe('broken.pdf (searchable).pdf already exists.');
  });

  it('says a cancelled file was never started', () => {
    expect(fileOutcome(CANCELLED)).toBe('Not started — the run was cancelled.');
  });

  it('does not mistake a saved file for an untouched one', () => {
    expect(isAlreadySearchable(done('C:\\in\\scan.pdf'))).toBe(false);
  });
});

describe('bulkReceipt', () => {
  it('counts only the copies that were actually written', () => {
    expect(bulkReceipt([done('a.pdf'), done('b.pdf')])).toBe('2 searchable copies saved.');
    expect(bulkReceipt([done('a.pdf')])).toBe('1 searchable copy saved.');
  });

  it('surfaces every other outcome alongside the successes', () => {
    expect(bulkReceipt([done('a.pdf'), ALREADY, FAILED, CANCELLED])).toBe(
      '1 searchable copy saved, 1 already searchable, 1 failed, 1 not started.'
    );
  });

  it('reports an all-failed run as zero saved', () => {
    expect(bulkReceipt([FAILED, FAILED])).toBe('0 searchable copies saved, 2 failed.');
  });
});

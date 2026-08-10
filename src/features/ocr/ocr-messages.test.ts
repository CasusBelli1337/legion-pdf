import { describe, expect, it } from 'vitest';
import type { OcrDetectResult, ProgressEvent } from '@shared/types';
import {
  detectSummary,
  groupDigits,
  isCancellation,
  pageLabel,
  percentComplete,
  plainError,
  runButtonLabel,
  runReceipt,
} from './ocr-messages';

function detected(pageCount: number, needing: number[]): OcrDetectResult {
  const all = Array.from({ length: pageCount }, (_value, index) => index + 1);
  return {
    pageCount,
    pagesNeedingOcr: needing,
    pagesWithText: all.filter((page) => !needing.includes(page)),
  };
}

function progress(current: number, total: number): ProgressEvent {
  return { docId: 'doc-1', phase: 'Recognizing text', current, total };
}

describe('detectSummary', () => {
  it('says it the way the PRD says it', () => {
    const all = Array.from({ length: 214 }, (_value, index) => index + 1);
    expect(detectSummary(detected(214, all))).toBe('214 of 214 pages need text recognition.');
  });

  it('reports a partial scan', () => {
    expect(detectSummary(detected(12, [3, 4, 5]))).toBe('3 of 12 pages need text recognition.');
  });

  it('uses singular grammar for a single page needing work', () => {
    expect(detectSummary(detected(12, [3]))).toBe('1 of 12 pages needs text recognition.');
  });

  it('says so plainly when there is nothing to do', () => {
    expect(detectSummary(detected(12, []))).toBe('All 12 pages already have searchable text.');
    expect(detectSummary(detected(1, []))).toBe('All 1 page already has searchable text.');
  });

  it('handles a document with no pages', () => {
    expect(detectSummary(detected(0, []))).toBe('This document has no pages.');
  });

  it('groups digits so a big production is readable', () => {
    const many = Array.from({ length: 2400 }, (_value, index) => index + 1);
    expect(detectSummary(detected(2400, many))).toContain('2,400 of 2,400 pages');
  });
});

describe('runButtonLabel', () => {
  it('says exactly what the button will do', () => {
    expect(runButtonLabel(detected(214, [1, 2, 3]))).toBe('Recognize text on 3 pages');
    expect(runButtonLabel(detected(214, [7]))).toBe('Recognize text on 1 page');
  });

  it('is honest when there is nothing to recognize', () => {
    expect(runButtonLabel(detected(4, []))).toBe('Nothing to recognize');
    expect(runButtonLabel(null)).toBe('Nothing to recognize');
  });
});

describe('pageLabel', () => {
  it('is the counter the UI rules require', () => {
    expect(pageLabel(progress(37, 214))).toBe('Page 37 of 214');
  });

  it('never shows a count past the total', () => {
    expect(pageLabel(progress(215, 214))).toBe('Page 214 of 214');
  });

  it('shows nothing before a run starts', () => {
    expect(pageLabel(null)).toBe('');
    expect(pageLabel(progress(0, 0))).toBe('');
  });
});

describe('percentComplete', () => {
  it('tracks the run', () => {
    expect(percentComplete(progress(0, 214))).toBe(0);
    expect(percentComplete(progress(107, 214))).toBe(50);
    expect(percentComplete(progress(214, 214))).toBe(100);
  });

  it('stays inside 0-100 whatever it is handed', () => {
    expect(percentComplete(progress(-4, 214))).toBe(0);
    expect(percentComplete(progress(999, 214))).toBe(100);
    expect(percentComplete(null)).toBe(0);
  });
});

describe('runReceipt', () => {
  it('reports pages, words, and characters, in counts the user can check', () => {
    expect(
      runReceipt({
        pagesOcred: [1, 2, 3],
        charsPerPage: [1200, 1300, 1100],
        wordsPerPage: [210, 230, 190],
      })
    ).toBe('Added searchable text to 3 pages — 630 words, 3,600 characters recognized.');
  });

  it('uses singular grammar for one page', () => {
    expect(runReceipt({ pagesOcred: [4], charsPerPage: [1], wordsPerPage: [1] })).toBe(
      'Added searchable text to 1 page — 1 word, 1 character recognized.'
    );
  });

  it('groups digits so a big production stays readable', () => {
    expect(runReceipt({ pagesOcred: [1], charsPerPage: [48213], wordsPerPage: [8402] })).toContain(
      '8,402 words, 48,213 characters'
    );
  });
});

describe('isCancellation', () => {
  it('recognizes the main process sentinel through Electron wrapping', () => {
    const wrapped = new Error(
      "Error invoking remote method 'ocr:run': Error: OCR_CANCELLED: Text recognition was cancelled."
    );
    expect(isCancellation(wrapped)).toBe(true);
  });

  it('does not mistake a real failure for a cancellation', () => {
    expect(isCancellation(new Error('Tesseract exited with code 1'))).toBe(false);
  });
});

describe('plainError', () => {
  it('strips the IPC plumbing an attorney should never see', () => {
    const wrapped = new Error(
      "Error invoking remote method 'ocr:run': Error: Page 4 produced no recognized text."
    );
    expect(plainError(wrapped)).toBe('Page 4 produced no recognized text.');
  });

  it('leaves a plain sentence alone', () => {
    expect(plainError(new Error('Tesseract is not installed.'))).toBe(
      'Tesseract is not installed.'
    );
  });

  it('copes with something that is not an Error at all', () => {
    expect(plainError('just a string')).toBe('just a string');
  });
});

describe('groupDigits', () => {
  it('separates thousands', () => {
    expect(groupDigits(48213)).toBe('48,213');
    expect(groupDigits(7)).toBe('7');
  });
});

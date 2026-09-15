/**
 * The Word-export corpus: real producers, fictional parties. Every entry is a
 * PDF under qa/fixtures/word-export/ and the bar its export has to clear.
 * Thresholds are points; `wordsTolerance` is how many words per page may fail
 * to align (hyphenation healed at a line end, a curly quote re-encoded).
 */

export interface CorpusFixture {
  /** File name under qa/fixtures/word-export/, without .pdf. */
  name: string;
  producer: string;
  purpose: string;
  /** Median |baseline dy| per page must not exceed this. */
  medianDy: number;
  /** 95th percentile |baseline dy| per page must not exceed this. */
  p95Dy: number;
  /** Words per page that may fail to align. */
  wordsTolerance: number;
  /** True when the pages carry pleading line numbers that must all land on their lines. */
  lineNumbers: boolean;
  /** How far a line number may sit from the source's, points (0.5 unless the source is a scan). */
  lineNumberTolerance?: number;
  /** The PDF the export is measured against when the fixture itself is a scan of it. */
  truth?: string;
}

export const CORPUS: readonly CorpusFixture[] = [
  {
    name: 'pleading-word',
    producer: 'Microsoft Word (Legion CA pleading template, header-table numbers)',
    purpose:
      'caption on 28-line paper, numbered headings, block quote across numbered lines, signature block, footer title',
    medianDy: 0.5,
    p95Dy: 1,
    wordsTolerance: 2,
    lineNumbers: true,
  },
  {
    name: 'pleading-scan',
    producer: 'print-and-scan of pleading-word (200 dpi grayscale raster, no text layer)',
    purpose: 'a scanned pleading: the exporter must recognise the text first',
    medianDy: 2,
    p95Dy: 4,
    wordsTolerance: 20,
    lineNumbers: true,
    lineNumberTolerance: 1.5,
    truth: 'pleading-word',
  },
  {
    name: 'pleading-scan-ocr',
    producer: 'pleading-scan with Legion PDF’s own OCR text layer (Tesseract, invisible text)',
    purpose: 'a scan already made searchable: hidden text becomes editable paragraphs on the grid',
    medianDy: 2,
    p95Dy: 4,
    wordsTolerance: 20,
    lineNumbers: true,
    lineNumberTolerance: 1.5,
    truth: 'pleading-word',
  },
  {
    name: 'filing-mixed',
    producer:
      'Microsoft Word (another firm’s template: Word line numbering, Century Schoolbook + Arial, footnotes)',
    purpose:
      'opposing-counsel filing: ruled caption table, footnotes, running head, signature block, proof of service',
    medianDy: 0.5,
    p95Dy: 1,
    wordsTolerance: 4,
    lineNumbers: true,
  },
  {
    name: 'deposition-word',
    producer:
      'Microsoft Word (court-reporter style: Courier New, 25 numbered lines, one paragraph per line)',
    purpose:
      'transcript Q/A and colloquy on a 25-line grid, then a certificate page without numbers',
    medianDy: 0.5,
    p95Dy: 1,
    wordsTolerance: 2,
    lineNumbers: true,
  },
];

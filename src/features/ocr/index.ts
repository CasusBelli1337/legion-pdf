/**
 * Text Recognition (F-7) — the lane's single import point for the shell.
 */

export { OcrPanel } from './ocr-panel';
export { BulkOcrSection } from './bulk-ocr-section';
export { OCR_DPI, useOcr } from './use-ocr';
export type { OcrController, OcrPhase, OcrState } from './use-ocr';
export { useBulkOcr } from './use-bulk-ocr';
export type { BulkOcrController, BulkOcrState, BulkPhase } from './use-bulk-ocr';

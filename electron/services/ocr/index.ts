/**
 * The OCR service surface the IPC lane wires up. One import point so the
 * main-process half of text recognition stays a single greppable list.
 */

export { OcrService } from './ocr-service';
export type { OcrProgress, OcrServiceDeps } from './ocr-service';
export { MAX_OCR_WORKERS, poolSize, runPool, throwIfCancelled } from './pool';
export { recognizePage } from './page-worker';
export type { PageJobContext } from './page-worker';
export { BUNDLE_DIRECTORY, TesseractNotFoundError, resolveTesseract } from './tesseract-binary';
export type { ResolveTesseractOptions, TesseractLocation } from './tesseract-binary';
export {
  OCR_CANCELLED,
  OcrCancelledError,
  TesseractFailedError,
  runTesseractHocr,
  tesseractArguments,
} from './tesseract-cli';
export type { SpawnFn, SpawnedProcess, TesseractRunRequest } from './tesseract-cli';

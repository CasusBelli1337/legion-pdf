// #seam:ipc-contract
/**
 * LANE D (OCR) — owned by the OCR agent.
 * Detect text-layer gaps, run the bundled Tesseract worker pool, cancel a run.
 * Page rasters come from context.requestRaster (the renderer owns pdfjs);
 * stream progress with context.emitProgress('ocr:progress', ...).
 */

import { invokeChannelsOf } from '@shared/ipc';
import type { IpcContext } from './context';
import { registerNotImplemented } from './not-implemented';

export function registerOcrHandlers(_context: IpcContext): void {
  registerNotImplemented(invokeChannelsOf('ocr'));
}

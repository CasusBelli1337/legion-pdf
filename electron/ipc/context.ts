/**
 * What every IPC handler module receives. Feature lanes take this and nothing
 * else from the foundation, so a lane can be built and reviewed in isolation.
 */

import type { BrowserWindow } from 'electron';
import type { ProgressChannel } from '@shared/ipc';
import type { ProgressEvent, RasterRequest, RasterResponse } from '@shared/types';
import type { DocStore } from '../services/doc-store';

export interface IpcContext {
  /** The main-process byte store — single source of truth for open documents. */
  store: DocStore;
  /** The main window, or null before it exists / after it is destroyed. */
  getWindow(): BrowserWindow | null;
  /** Stream page-level progress to the UI ("Page 37 / 214"). */
  emitProgress(channel: ProgressChannel, event: ProgressEvent): void;
  /**
   * Ask the renderer (the only zone with a canvas) to rasterize a page.
   * OCR and redaction both build on this rather than shipping a second engine.
   */
  requestRaster(request: Omit<RasterRequest, 'requestId'>): Promise<RasterResponse>;
}

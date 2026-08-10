/**
 * Main-side half of the rasterization round-trip. pdfjs needs a canvas, which
 * only the renderer has, so main-process pipelines (OCR, redaction) ask the
 * renderer for page rasters over `raster:request` / `raster:response`.
 */

import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { RasterRequest, RasterResponse } from '@shared/types';

interface PendingRaster {
  resolve(response: RasterResponse): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class MainRasterBridge {
  private readonly pending = new Map<string, PendingRaster>();
  private readonly getWindow: () => BrowserWindow | null;
  private readonly timeoutMs: number;

  constructor(getWindow: () => BrowserWindow | null, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.getWindow = getWindow;
    this.timeoutMs = timeoutMs;
    ipcMain.on(IPC.raster.response, (_event, response: RasterResponse) => this.settle(response));
  }

  /** Resolves with PNG bytes for one page, or rejects loudly — never an empty raster. */
  request(request: Omit<RasterRequest, 'requestId'>): Promise<RasterResponse> {
    const window = this.getWindow();
    if (window === null) {
      return Promise.reject(new Error('No window is open to rasterize with.'));
    }
    const requestId = randomUUID();
    return new Promise<RasterResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Rasterizing page ${request.page} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      window.webContents.send(IPC.raster.request, {
        ...request,
        requestId,
      } satisfies RasterRequest);
    });
  }

  private settle(response: RasterResponse): void {
    const entry = this.pending.get(response.requestId);
    if (entry === undefined) return;
    this.pending.delete(response.requestId);
    clearTimeout(entry.timer);
    if (response.error !== undefined) {
      entry.reject(new Error(response.error));
      return;
    }
    if (response.png === null || response.png.byteLength === 0) {
      entry.reject(new Error('The renderer returned an empty raster.'));
      return;
    }
    entry.resolve(response);
  }
}

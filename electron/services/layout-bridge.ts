/**
 * Main-side half of the layout round-trip. A page's layout — text runs with
 * fonts and colours, decoded pictures, rules — can only be read by pdfjs with
 * its fonts loaded, which lives in the renderer. So the Word exporter asks over
 * `layout:request` and waits on `layout:response`, exactly the way OCR and
 * redaction ask for rasters (raster-bridge.ts).
 */

import { randomUUID } from 'node:crypto';
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { LayoutRequest, LayoutResponse } from '@shared/types';

interface PendingLayout {
  resolve(response: LayoutResponse): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/** A page with hundreds of pictures can take a while; a minute is generous. */
const DEFAULT_TIMEOUT_MS = 60_000;

export class MainLayoutBridge {
  private readonly pending = new Map<string, PendingLayout>();
  private readonly getWindow: () => BrowserWindow | null;
  private readonly timeoutMs: number;

  constructor(getWindow: () => BrowserWindow | null, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.getWindow = getWindow;
    this.timeoutMs = timeoutMs;
    ipcMain.on(IPC.layout.response, (_event, response: LayoutResponse) => this.settle(response));
  }

  /** Resolves with the page's layout, or rejects loudly — never an empty page. */
  request(request: Omit<LayoutRequest, 'requestId'>): Promise<LayoutResponse> {
    const window = this.getWindow();
    if (window === null) {
      return Promise.reject(new Error('No window is open to read the page with.'));
    }
    const requestId = randomUUID();
    return new Promise<LayoutResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Reading page ${request.page} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      window.webContents.send(IPC.layout.request, {
        ...request,
        requestId,
      } satisfies LayoutRequest);
    });
  }

  private settle(response: LayoutResponse): void {
    const entry = this.pending.get(response.requestId);
    if (entry === undefined) return;
    this.pending.delete(response.requestId);
    clearTimeout(entry.timer);
    if (response.error !== undefined) {
      entry.reject(new Error(response.error));
      return;
    }
    if (response.layout === null) {
      entry.reject(new Error('The renderer returned no layout for the page.'));
      return;
    }
    entry.resolve(response);
  }
}

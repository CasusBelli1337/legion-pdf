/**
 * Main process entry: one window, the byte store, the IPC surface, the menu.
 * Business logic lives in core/; this file only wires things together.
 */

import { join } from 'node:path';
import { BrowserWindow, app, shell } from 'electron';
import { IPC } from '@shared/ipc';
import type { ProgressChannel } from '@shared/ipc';
import type { MenuAction, ProgressEvent, RasterRequest } from '@shared/types';
import { DocStore } from './services/doc-store';
import { MainRasterBridge } from './services/raster-bridge';
import { registerIpcHandlers } from './ipc';
import { installAppMenu } from './menu';
import { installUnsavedGuard } from './unsaved-guard';

const isDevelopment = !app.isPackaged;
const rendererDevUrl = process.env['ELECTRON_RENDERER_URL'];

let mainWindow: BrowserWindow | null = null;

function getWindow(): BrowserWindow | null {
  return mainWindow !== null && !mainWindow.isDestroyed() ? mainWindow : null;
}

function send(channel: string, payload: unknown): void {
  getWindow()?.webContents.send(channel, payload);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#09090B',
    show: false,
    title: 'Legion Armory - Librarius',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });

  // Nothing in this app opens a second window; external links go to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDevelopment && rendererDevUrl !== undefined) {
    void window.loadURL(rendererDevUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  return window;
}

function bootstrap(): void {
  const store = new DocStore({
    recentFilePath: join(app.getPath('userData'), 'recent-files.json'),
  });
  const rasterBridge = new MainRasterBridge(getWindow);

  registerIpcHandlers({
    store,
    getWindow,
    emitProgress: (channel: ProgressChannel, event: ProgressEvent) => send(channel, event),
    requestRaster: (request: Omit<RasterRequest, 'requestId'>) => rasterBridge.request(request),
  });

  installAppMenu((action: MenuAction) => send(IPC.app.menu, action), isDevelopment);
  // Before the window exists: the guard attaches to `browser-window-created`.
  installUnsavedGuard(store, getWindow);
  mainWindow = createWindow();
}

void app.whenReady().then(() => {
  bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

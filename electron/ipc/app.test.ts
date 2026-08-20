import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { IpcContext } from './context';

/**
 * F-5, at the handler rather than at the classifier: cancelling the print dialog
 * must come back to the renderer as a plain resolve, because `printActive`'s only
 * error styling is its catch block. A real fault still has to reject, or a
 * printer that is not there would fail silently.
 *
 * `ipcMain` does not exist in this environment, so it is stubbed just far enough
 * to capture the handler the module registers and call it.
 */

type Handler = () => Promise<void>;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0' },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  },
}));

const { registerAppHandlers } = await import('./app');

type PrintCallback = (success: boolean, failureReason: string) => void;

/** A window whose print dialog ends the way the test says it ends. */
function windowThatPrints(success: boolean, failureReason: string): BrowserWindow {
  const webContents = {
    print: (_options: unknown, callback: PrintCallback) => callback(success, failureReason),
  };
  return { webContents } as unknown as BrowserWindow;
}

function printHandlerFor(window: BrowserWindow | null): Handler {
  handlers.clear();
  registerAppHandlers({ getWindow: () => window } as unknown as IpcContext);
  const handler = handlers.get(IPC.app.print);
  if (handler === undefined) throw new Error('app:print was never registered');
  return handler;
}

describe('the print handler', () => {
  // The exact string Electron 43 sends when the attorney backs out. Before the
  // fix this became "COULD NOT PRINT: PRINT JOB CANCELED" in red.
  it('resolves quietly when the attorney cancels the dialog', async () => {
    const handler = printHandlerFor(windowThatPrints(false, 'Print job canceled'));

    await expect(handler()).resolves.toBeUndefined();
  });

  it('resolves quietly on the older spelling and on an empty reason', async () => {
    await expect(printHandlerFor(windowThatPrints(false, 'cancelled'))()).resolves.toBeUndefined();
    await expect(printHandlerFor(windowThatPrints(false, ''))()).resolves.toBeUndefined();
  });

  it('resolves when the job actually printed', async () => {
    const handler = printHandlerFor(windowThatPrints(true, ''));

    await expect(handler()).resolves.toBeUndefined();
  });

  // The whole point of narrowing the cancel case: real faults keep their error.
  it('still rejects a genuine failure, so the footer still says so', async () => {
    const handler = printHandlerFor(windowThatPrints(false, 'Invalid printer settings'));

    await expect(handler()).rejects.toThrow('Invalid printer settings');
  });

  it('does nothing at all when there is no window to print from', async () => {
    const handler = printHandlerFor(null);

    await expect(handler()).resolves.toBeUndefined();
  });
});

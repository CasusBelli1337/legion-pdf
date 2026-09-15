import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import type { LayoutRequest, LayoutResponse, PageLayout } from '@shared/types';

type Listener = (event: unknown, response: LayoutResponse) => void;
const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: Listener) => listeners.set(channel, listener),
  },
}));

const { MainLayoutBridge } = await import('./layout-bridge');

const LAYOUT: PageLayout = {
  page: 1,
  size: { width: 612, height: 792 },
  rotation: 0,
  fonts: {},
  runs: [],
  images: [],
  rules: [],
  printedPageNumber: null,
};

function windowThatAnswers(answer: (request: LayoutRequest) => Partial<LayoutResponse>) {
  const send = vi.fn((_channel: string, request: LayoutRequest) => {
    const reply = listeners.get(IPC.layout.response);
    queueMicrotask(() =>
      reply?.(null, { requestId: request.requestId, layout: null, ...answer(request) })
    );
  });
  return { window: { webContents: { send } } as unknown as BrowserWindow, send };
}

beforeEach(() => listeners.clear());

describe('MainLayoutBridge', () => {
  it('sends a layout:request and resolves with the renderer’s answer', async () => {
    const { window, send } = windowThatAnswers(() => ({ layout: LAYOUT }));
    const bridge = new MainLayoutBridge(() => window);
    const response = await bridge.request({ docId: 'doc', page: 1 });
    expect(response.layout).toEqual(LAYOUT);
    expect(send).toHaveBeenCalledWith(
      IPC.layout.request,
      expect.objectContaining({ docId: 'doc', page: 1 })
    );
  });

  it('rejects with the renderer’s plain-English error', async () => {
    const { window } = windowThatAnswers(() => ({ error: 'Page 9 is outside this document.' }));
    const bridge = new MainLayoutBridge(() => window);
    await expect(bridge.request({ docId: 'doc', page: 9 })).rejects.toThrow(
      /outside this document/
    );
  });

  it('rejects a null layout with no error rather than resolving empty', async () => {
    const { window } = windowThatAnswers(() => ({}));
    const bridge = new MainLayoutBridge(() => window);
    await expect(bridge.request({ docId: 'doc', page: 1 })).rejects.toThrow(/no layout/);
  });

  it('rejects when there is no window, and times out when the renderer never answers', async () => {
    const bridge = new MainLayoutBridge(() => null, 20);
    await expect(bridge.request({ docId: 'doc', page: 1 })).rejects.toThrow(/No window/);
    const silent = { webContents: { send: vi.fn() } } as unknown as BrowserWindow;
    const slow = new MainLayoutBridge(() => silent, 20);
    await expect(slow.request({ docId: 'doc', page: 2 })).rejects.toThrow(/timed out/);
  });
});

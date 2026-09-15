import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@renderer/app/store';
import { STAMPS_TOOL_ID, requestTextTool, usePanelRequest } from './panel-request';

beforeEach(() => {
  usePanelRequest.setState({ seq: 0, handled: 0, tool: 'off', armed: 'off' });
  useAppStore.setState({ activeToolId: null });
});

describe('requestTextTool', () => {
  it('opens the Stamps panel and leaves one request to be taken', () => {
    requestTextTool('edit');
    expect(useAppStore.getState().activeToolId).toBe(STAMPS_TOOL_ID);
    expect(usePanelRequest.getState().take()).toBe('edit');
    // Taken once: a panel that re-mounts must not arm it again.
    expect(usePanelRequest.getState().take()).toBeNull();
  });

  it('toggles: asking for the tool that is already armed disarms it', () => {
    usePanelRequest.getState().noteArmed('edit');
    requestTextTool('edit');
    expect(usePanelRequest.getState().take()).toBe('off');
  });

  it('numbers requests so a late panel answers only the newest', () => {
    requestTextTool('text');
    requestTextTool('edit');
    expect(usePanelRequest.getState().seq).toBe(2);
    expect(usePanelRequest.getState().take()).toBe('edit');
    expect(usePanelRequest.getState().take()).toBeNull();
  });
});

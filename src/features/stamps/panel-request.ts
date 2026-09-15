/**
 * "Take me to Edit text" from anywhere: the toolbar button and the Edit menu
 * ask for a Text tool here; the Stamps panel opens on its Text tab and arms
 * the tool when it sees the request. A tiny store rather than props, because
 * the askers (shell toolbar, menu) and the answerer (a dock panel that may not
 * even be mounted yet) share no parent.
 *
 * Requests are numbered so a panel that mounts later, or re-mounts on a tab
 * switch, never re-runs a request it has already answered.
 */

import { create } from 'zustand';
import { useAppStore } from '@renderer/app/store';
import type { TextTool } from './text-actions';

interface PanelRequestState {
  /** Bumped on every request; 0 means none has been made. */
  seq: number;
  /** The last request the panel answered. */
  handled: number;
  tool: TextTool;
  /** What the Text section currently has armed, for pressed states elsewhere. */
  armed: TextTool;
  request(tool: TextTool): void;
  /** The tool still to be armed, or null; marks it answered. */
  take(): TextTool | null;
  noteArmed(tool: TextTool): void;
}

export const usePanelRequest = create<PanelRequestState>((set, get) => ({
  seq: 0,
  handled: 0,
  tool: 'off',
  armed: 'off',
  request: (tool) => set((state) => ({ seq: state.seq + 1, tool })),
  take: () => {
    const { seq, handled, tool } = get();
    if (seq === handled) return null;
    set({ handled: seq });
    return tool;
  },
  noteArmed: (tool) => set({ armed: tool }),
}));

/** The id the Stamps & Marks panel is registered under in the tool dock. */
export const STAMPS_TOOL_ID = 'stamps';

/**
 * Opens Stamps & Marks on its Text tab with `tool` armed — or, when that tool
 * is already armed, disarms it, so the toolbar button toggles like the others.
 */
export function requestTextTool(tool: Exclude<TextTool, 'off'>): void {
  const { armed, request } = usePanelRequest.getState();
  useAppStore.getState().setActiveTool(STAMPS_TOOL_ID);
  request(armed === tool ? 'off' : tool);
}

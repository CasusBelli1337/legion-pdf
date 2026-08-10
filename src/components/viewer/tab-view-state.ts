/**
 * Per-tab view settings. Zoom, fit preset, and scroll page are a property of
 * the DOCUMENT, not the app: switching tabs and coming back must land where the
 * attorney left off. The app store carries only the active tab's numbers (the
 * status footer and the View menu read them), so the rest is kept here.
 */

export type FitMode = 'none' | 'width' | 'page';

export interface TabViewState {
  zoom: number;
  fitMode: FitMode;
  page: number;
}

const DEFAULT_STATE: TabViewState = { zoom: 1, fitMode: 'width', page: 1 };

const states = new Map<string, TabViewState>();

export function readTabView(docId: string): TabViewState {
  return states.get(docId) ?? DEFAULT_STATE;
}

export function writeTabView(docId: string, patch: Partial<TabViewState>): TabViewState {
  const next = { ...readTabView(docId), ...patch };
  states.set(docId, next);
  return next;
}

/** Called when a tab closes, so a reopened file starts fresh. */
export function forgetTabView(docId: string): void {
  states.delete(docId);
}

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
  /**
   * How far into that page the top of the viewport sat, as a share of the
   * page's height (0 = its top edge). Zoom-independent, so the same spot comes
   * back at any scale — the page number alone lands the reader at the top of
   * the page, up to a full page away from where they were.
   */
  offset: number;
}

const DEFAULT_STATE: TabViewState = { zoom: 1, fitMode: 'width', page: 1, offset: 0 };

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

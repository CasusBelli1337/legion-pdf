/**
 * Keeping the page the attorney is reading across a byte swap.
 *
 * Every edit — bates, rotate, bookmarks, redaction — replaces the document's
 * bytes, and the viewer reloads pdfjs from the new ones. While that runs the
 * page run is unmounted: the scroll container collapses to nothing, the browser
 * clamps its scrollTop to 0, and the scroll event that follows would file page 1
 * as the page being read. So the page is captured the moment the run goes away
 * and owed back to the attorney until the run is mounted and measured again.
 *
 * Pure state machine; the hook in ./use-page-navigation is the ref around it.
 */

export interface RestoreState {
  /** Page owed to a re-mounted page run, or null when the viewer is settled. */
  owed: number | null;
  /** The document this state is tracking, so a new tab captures its own page. */
  docId: string | null;
  /** Whether the page run was mounted at the last render. */
  wasReady: boolean;
}

export const NOTHING_OWED: RestoreState = { owed: null, docId: null, wasReady: false };

/**
 * What the viewer owes after a render. A page is captured when a document is
 * opened (come back to a tab where you left it) and whenever the page run goes
 * away under a document that is staying open (a byte swap).
 */
export function onViewerRender(
  state: RestoreState,
  docId: string,
  isReady: boolean,
  rememberedPage: number
): RestoreState {
  const isNewDocument = state.docId !== docId;
  const runWentAway = state.wasReady && !isReady;
  return {
    owed: isNewDocument || runWentAway ? rememberedPage : state.owed,
    docId,
    wasReady: isReady,
  };
}

/** The owed page has been scrolled to; the viewer is the attorney's again. */
export function afterRestore(state: RestoreState): RestoreState {
  return { ...state, owed: null };
}

/**
 * True while a page is owed. A scroll event in that window is the page run
 * being rebuilt, never the attorney reading, so it must not be filed as one.
 */
export function isPageOwed(state: RestoreState): boolean {
  return state.owed !== null;
}

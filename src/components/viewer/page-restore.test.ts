import { describe, expect, it } from 'vitest';
import { NOTHING_OWED, afterRestore, isPageOwed, onViewerRender } from './page-restore';
import type { RestoreState } from './page-restore';

/** The viewer's render loop: bytes load, the run mounts, the reader scrolls. */
function open(docId: string, page: number): RestoreState {
  const opening = onViewerRender(NOTHING_OWED, docId, false, page);
  const ready = onViewerRender(opening, docId, true, page);
  return afterRestore(ready);
}

describe('page restore across a byte swap', () => {
  it('owes a freshly opened document the page it was left on', () => {
    const opening = onViewerRender(NOTHING_OWED, 'doc-1', false, 250);
    expect(opening.owed).toBe(250);
    expect(isPageOwed(opening)).toBe(true);
  });

  // The owner-reported bug: adding a bookmark on page 250 threw the viewer back
  // to page 1. Every op swaps the bytes, so this covers all of them.
  it('owes the page being read when the page run goes away under it', () => {
    const settled = open('doc-1', 250);
    expect(isPageOwed(settled)).toBe(false);

    const swapped = onViewerRender(settled, 'doc-1', false, 250);
    expect(swapped.owed).toBe(250);
  });

  it('ignores scrolling while a page is owed, so the collapse cannot file page 1', () => {
    const swapped = onViewerRender(open('doc-1', 250), 'doc-1', false, 250);
    // The container collapses and the browser clamps the scroll to the top.
    expect(isPageOwed(swapped)).toBe(true);
    // ... and once the run is back and the page restored, tracking resumes.
    const restored = afterRestore(onViewerRender(swapped, 'doc-1', true, 250));
    expect(isPageOwed(restored)).toBe(false);
  });

  it('owes nothing while the viewer just sits there mounted', () => {
    let state = open('doc-1', 250);
    for (let render = 0; render < 5; render += 1) {
      state = onViewerRender(state, 'doc-1', true, 250 + render);
      expect(isPageOwed(state)).toBe(false);
    }
  });

  it('captures each tab its own page', () => {
    const first = open('doc-1', 250);
    const second = onViewerRender(first, 'doc-2', false, 12);
    expect(second.owed).toBe(12);
    expect(second.docId).toBe('doc-2');
  });

  it('holds the owed page until the run is actually back', () => {
    let state = onViewerRender(open('doc-1', 250), 'doc-1', false, 250);
    for (let render = 0; render < 3; render += 1) {
      state = onViewerRender(state, 'doc-1', false, 250);
      expect(state.owed).toBe(250);
    }
  });
});

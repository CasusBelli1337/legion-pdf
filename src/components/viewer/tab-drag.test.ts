import { describe, expect, it } from 'vitest';
import { hasTabDrag, tabDragId, TAB_DRAG_TYPE } from './tab-drag';

/** A stand-in for the browser's DataTransfer — only the two members used here. */
function transfer(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    getData: (format: string) => entries[format] ?? '',
  };
}

/**
 * The seam between the tab bar and the reference pane. `getData` is blanked by
 * the browser during a dragover, so "is this a tab?" has to be answerable from
 * `types` alone — otherwise the pane refuses the drop it is meant to accept.
 */
describe('a tab dragged onto the reference pane', () => {
  it('is recognised from the types alone, before the drop', () => {
    expect(hasTabDrag({ types: [TAB_DRAG_TYPE] })).toBe(true);
  });

  it('reads the document id out of the drop', () => {
    expect(tabDragId(transfer({ [TAB_DRAG_TYPE]: 'doc-2' }))).toBe('doc-2');
  });

  it('ignores files dragged in from Explorer', () => {
    const files = transfer({ Files: '' });

    expect(hasTabDrag(files)).toBe(false);
    expect(tabDragId(files)).toBeNull();
  });

  it('treats an empty id as no tab at all, rather than looking up ""', () => {
    expect(tabDragId(transfer({ [TAB_DRAG_TYPE]: '  ' }))).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { isViewerSelection, upgradeCopiedText } from './use-smart-copy';
import type { ContainerLike, SelectionLike } from './use-smart-copy';

/**
 * F-3. Ctrl+C used to be Chromium's native copy of the text layer, so an
 * attorney got the transcript with its per-line breaks and a broken hyphen
 * instead of the paragraph the right-click menu gives. Two decisions carry the
 * fix, and both are pinned here: whether the selection is even the document's,
 * and what happens when the engine cannot read it.
 */

const PAGE_TEXT = { id: 'span-in-page' };
const CHAT_TEXT = { id: 'span-in-centurion' };

function pageRun(...nodes: unknown[]): ContainerLike {
  return { contains: (node) => nodes.includes(node) };
}

function selectionOf(anchorNode: unknown, focusNode: unknown = anchorNode): SelectionLike {
  return { isCollapsed: false, anchorNode, focusNode };
}

describe('deciding whether a selection is the document', () => {
  it('claims a selection that lives inside the page run', () => {
    expect(isViewerSelection(selectionOf(PAGE_TEXT), pageRun(PAGE_TEXT))).toBe(true);
  });

  // The find bar and the Centurion chat are outside the scroll container, and
  // copying from them must behave exactly as it always has.
  it('leaves a selection outside the page run alone', () => {
    expect(isViewerSelection(selectionOf(CHAT_TEXT), pageRun(PAGE_TEXT))).toBe(false);
  });

  it('leaves a selection that only STARTS in the document alone', () => {
    expect(isViewerSelection(selectionOf(PAGE_TEXT, CHAT_TEXT), pageRun(PAGE_TEXT))).toBe(false);
  });

  it('ignores a caret that has selected nothing', () => {
    const caret: SelectionLike = { isCollapsed: true, anchorNode: PAGE_TEXT, focusNode: PAGE_TEXT };

    expect(isViewerSelection(caret, pageRun(PAGE_TEXT))).toBe(false);
  });

  it('is false when there is no selection or no viewer on screen', () => {
    expect(isViewerSelection(null, pageRun(PAGE_TEXT))).toBe(false);
    expect(isViewerSelection(selectionOf(PAGE_TEXT), null)).toBe(false);
    expect(isViewerSelection(selectionOf(null), pageRun(PAGE_TEXT))).toBe(false);
  });
});

describe('replacing what the native copy left on the clipboard', () => {
  const FLOWING =
    'Q. On transcript page one, did you review the trust instrument? ' +
    'A. I did not read the whole document, only the signature page.';

  it('writes the same flowing prose the menu Copy writes', async () => {
    const writeText = vi.fn(async (): Promise<void> => undefined);
    const landed = await upgradeCopiedText(() => Promise.resolve(FLOWING), {}, writeText);

    expect(landed).toBe(true);
    expect(writeText).toHaveBeenCalledWith(FLOWING);
  });

  /**
   * The native copy has already run by this point, so leaving the clipboard
   * untouched IS the fallback — the attorney keeps the raw text layer rather
   * than an empty clipboard. Ctrl+C can never come out broken.
   */
  it('leaves the native copy in place when the engine throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writeText = vi.fn(async (): Promise<void> => undefined);
    const landed = await upgradeCopiedText(
      () => Promise.reject(new Error('This page could not be classified.')),
      {},
      writeText
    );

    expect(landed).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('leaves the native copy in place rather than emptying the clipboard', async () => {
    const writeText = vi.fn(async (): Promise<void> => undefined);
    const landed = await upgradeCopiedText(() => Promise.resolve('   '), {}, writeText);

    expect(landed).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reads the selection before awaiting anything, so it cannot go stale', () => {
    const seen: unknown[] = [];
    const selection = selectionOf(PAGE_TEXT);
    void upgradeCopiedText(
      (given) => {
        seen.push(given);
        return Promise.resolve(FLOWING);
      },
      selection,
      async () => undefined
    );

    expect(seen).toEqual([selection]);
  });
});

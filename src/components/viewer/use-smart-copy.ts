/**
 * Ctrl+C over the document gives the same paragraph the selection menu's Copy
 * gives (F-3). Before this, the accelerator was Chromium's native `role: 'copy'`
 * and it copied the raw text layer — one line break per printed line, hyphens
 * left broken — so the feature an attorney actually wanted was reachable only by
 * right-clicking, which most of them never will.
 *
 * HOW IT INTERCEPTS, and why it does not preventDefault: the native copy is
 * allowed to run and put the raw text on the clipboard, and the flowing text
 * replaces it a moment later. That ordering IS the fallback — if the engine is
 * absent, slow, or throws, the attorney keeps exactly the Ctrl+C they have
 * always had instead of an empty clipboard. Nothing here can produce a broken
 * copy; the worst case is the old behaviour.
 *
 * A selection outside the page run — the find bar, the Centurion chat, a panel
 * — is left entirely alone: `isViewerSelection` is checked before anything else
 * happens.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { loadSmartText, type SmartText } from './page-classification';

/** The part of a DOM `Selection` this decision needs. */
export interface SelectionLike {
  readonly isCollapsed: boolean;
  readonly anchorNode: unknown;
  readonly focusNode: unknown;
}

/** The part of the scroll container this decision needs. */
export interface ContainerLike {
  contains(node: unknown): boolean;
}

/**
 * True only when BOTH ends of the selection sit inside the viewer's page run.
 * Both ends, because a selection that starts in the document and ends in a
 * panel is not a document selection and must not be rewritten.
 */
export function isViewerSelection(
  selection: SelectionLike | null,
  container: ContainerLike | null
): boolean {
  if (selection === null || container === null || selection.isCollapsed) return false;
  const { anchorNode, focusNode } = selection;
  if (anchorNode === null || focusNode === null) return false;
  return container.contains(anchorNode) && container.contains(focusNode);
}

/**
 * Replaces what the native copy just put on the clipboard with the flowing
 * text. False means the clipboard was left as the browser wrote it — which is
 * the correct outcome for an unreadable selection or a failing engine.
 */
export async function upgradeCopiedText(
  smartText: SmartText,
  selection: unknown,
  writeText: (text: string) => Promise<void>
): Promise<boolean> {
  try {
    const text = await smartText(selection);
    if (text.trim().length === 0) return false;
    await writeText(text);
    return true;
  } catch (error) {
    console.error('Ctrl+C kept the plain text layer: the selection could not be read.', error);
    return false;
  }
}

function writeToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function useSmartCopy(
  pdfDocument: PDFDocumentProxy | null,
  docId: string | null,
  scrollRef: RefObject<HTMLElement | null>
): void {
  const smartText = useRef<SmartText | null>(null);

  useEffect(() => {
    smartText.current = null;
    if (pdfDocument === null || docId === null) return;
    let cancelled = false;
    void loadSmartText(pdfDocument, docId).then((loaded) => {
      if (!cancelled) smartText.current = loaded;
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument, docId]);

  useEffect(() => {
    const onCopy = (): void => {
      const run = smartText.current;
      const selection = globalThis.getSelection();
      if (run === null || !isViewerSelection(selection, scrollRef.current)) return;
      void upgradeCopiedText(run, selection, writeToClipboard);
    };
    globalThis.document.addEventListener('copy', onCopy);
    return () => globalThis.document.removeEventListener('copy', onCopy);
  }, [scrollRef]);
}

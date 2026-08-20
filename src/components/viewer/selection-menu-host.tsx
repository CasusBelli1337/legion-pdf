/**
 * Renders whatever is in the selection-menu slot, anchored to the end of the
 * attorney's selection.
 *
 * Opens on a mouseup that left text selected and on a right-click inside a
 * selection; closes on Escape, on a scroll, on a click anywhere else, and
 * whenever the selection itself goes away. With an empty slot this mounts
 * nothing and listens for nothing.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { anchorFromRects, hasSelectedText, rectsOfSelectionEnd } from './selection-anchor';
import type { AnchorPoint } from './selection-anchor';
import { useRegisteredSelectionMenu } from './selection-menu-slot';

interface SelectionMenuHostProps {
  /** The scroll container the pages live in; gestures are listened for here. */
  scrollRef: RefObject<HTMLElement | null>;
}

function anchorFor(event: MouseEvent): AnchorPoint | null {
  const selection = window.getSelection();
  if (!hasSelectedText(selection) || selection === null) return null;
  return anchorFromRects(rectsOfSelectionEnd(selection), { x: event.clientX, y: event.clientY });
}

/** Opens the menu on the two gestures that mean "act on this selection". */
function useOpenGestures(
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  open: (anchor: AnchorPoint) => void
): void {
  useEffect(() => {
    const element = scrollRef.current;
    if (!enabled || element === null) return;

    const onMouseUp = (event: MouseEvent): void => {
      if (event.button !== 0) return;
      // After mouseup the browser has settled the selection; a frame later it
      // is safe to read, and a plain click has already collapsed it.
      requestAnimationFrame(() => {
        const anchor = anchorFor(event);
        if (anchor !== null) open(anchor);
      });
    };
    const onContextMenu = (event: MouseEvent): void => {
      const anchor = anchorFor(event);
      if (anchor === null) return;
      event.preventDefault();
      open(anchor);
    };

    element.addEventListener('mouseup', onMouseUp);
    element.addEventListener('contextmenu', onContextMenu);
    return () => {
      element.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('contextmenu', onContextMenu);
    };
  }, [enabled, open, scrollRef]);
}

/** Everything that means "put it away": Escape, a scroll, a click elsewhere. */
function useDismissal(isOpen: boolean, close: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="menu"]') !== null) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [close, isOpen]);
}

export function SelectionMenuHost({ scrollRef }: SelectionMenuHostProps) {
  const Menu = useRegisteredSelectionMenu();
  const [anchor, setAnchor] = useState<AnchorPoint | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const open = useCallback((next: AnchorPoint) => setAnchor(next), []);

  useOpenGestures(scrollRef, Menu !== null, open);
  useDismissal(anchor !== null, close);

  if (Menu === null || anchor === null) return null;
  // eslint-disable-next-line react-hooks/static-components -- the slot holds ONE module-level component reference, registered at import time and never rebuilt; this looks it up, it does not create it.
  return <Menu x={anchor.x} y={anchor.y} onClose={close} />;
}

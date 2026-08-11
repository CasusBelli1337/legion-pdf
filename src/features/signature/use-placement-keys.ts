/**
 * Delete removes the selected signature.
 *
 * Guarded on where the keystroke came from: an attorney typing a Bates prefix
 * or an exhibit label two panels over is not asking to delete anything, and a
 * global key handler that ignores that would eat their backspace.
 */

import { useEffect } from 'react';

const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return TYPING_TAGS.includes(target.tagName) || target.isContentEditable;
}

export function useDeleteSelectedPlacement(
  selectedId: string | null,
  remove: (id: string) => void
): void {
  useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      remove(selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [remove, selectedId]);
}

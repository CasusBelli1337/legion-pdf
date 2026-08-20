/**
 * Reading the current selection through the engine, once, for the menu.
 *
 * `undefined` means still working — the menu shows a pulse rather than four
 * dead rows — and `null` means there is nothing usable here (no body text, or
 * no text layer at all), which disables the actions instead of copying an
 * empty string.
 *
 * `prefix` is an input, not an argument: changing the document's source label
 * has to re-format the cite shown on the menu, and re-running the whole pass is
 * cheap because every page it touches is already classified and cached.
 *
 * The answer remembers WHICH inputs produced it, so a stale result is never
 * shown and the pending state costs no state write of its own — inputs that no
 * longer match ARE the pending state.
 */

import { useEffect, useState } from 'react';
import type { SelectCopyEngineHandle, SelectionPayload } from './engine';

interface Answer {
  engine: SelectCopyEngineHandle;
  selection: unknown;
  prefix: string;
  payload: SelectionPayload | null;
}

export function useSelectionPayload(
  engine: SelectCopyEngineHandle | null,
  selection: unknown,
  prefix: string
): SelectionPayload | null | undefined {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (engine === null) return;
    let cancelled = false;
    engine.setCitePrefix(prefix);
    const source = selection ?? (typeof window === 'undefined' ? null : window.getSelection());

    engine
      .selectionPayload(source)
      .then((payload) => {
        if (!cancelled) setAnswer({ engine, selection, prefix, payload });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setAnswer({ engine, selection, prefix, payload: null });
        console.error('This selection could not be read.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [engine, prefix, selection]);

  if (engine === null) return null;
  const current =
    answer !== null &&
    answer.engine === engine &&
    answer.selection === selection &&
    answer.prefix === prefix;
  return current ? answer.payload : undefined;
}

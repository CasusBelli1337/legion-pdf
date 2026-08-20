/**
 * The document's cite prefix as menu state: what it is, whether the attorney is
 * editing it, and what happens when he commits.
 *
 * It is its own hook because committing has three effects that must happen
 * together — persist it, tell the engine (which is what re-formats the cite),
 * and re-render the preview — and a menu that did two of the three would show a
 * cite that is not the one the clipboard gets.
 */

import { useState } from 'react';
import { readCitePrefix, writeCitePrefix } from './cite-prefix';
import type { PrefixTarget } from './cite-prefix';
import type { SelectCopyEngineHandle } from './engine';

export interface CitePrefixState {
  value: string;
  editing: boolean;
  beginEditing(): void;
  cancel(): void;
  commit(prefix: string): void;
}

export function useCitePrefix(
  target: PrefixTarget | null,
  engine: SelectCopyEngineHandle | null
): CitePrefixState {
  const [value, setValue] = useState(() => (target === null ? '' : readCitePrefix(target)));
  const [editing, setEditing] = useState(false);

  return {
    value,
    editing,
    beginEditing: () => setEditing(true),
    cancel: () => setEditing(false),
    commit: (prefix) => {
      const trimmed = prefix.trim();
      if (target !== null) writeCitePrefix(target, trimmed);
      engine?.setCitePrefix(trimmed);
      setValue(trimmed);
      setEditing(false);
    },
  };
}

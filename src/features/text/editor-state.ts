/**
 * The in-place editor's state machine, kept pure so the rules can be tested
 * without a page, a viewer, or a keyboard.
 *
 * The rules the attorney feels: Escape always abandons, Ctrl+Enter always
 * commits, an empty box commits nothing (clicking away from an empty box is a
 * change of mind, not an edit), and once a commit is in flight the keystrokes
 * that arrive during it cannot change what is being written.
 */

import type { TextFontChoice } from '@shared/types';
import type { FontMatch } from './font-match';

export interface TextDraft {
  text: string;
  fontSize: number;
  /** Hex, e.g. "#000000". */
  color: string;
  font: TextFontChoice;
}

export const DEFAULT_DRAFT: TextDraft = {
  text: '',
  fontSize: 12,
  color: '#000000',
  font: { family: 'helvetica' },
};

export interface EditorState {
  /** 'saving' while the stamp is in flight — the surface goes read-only. */
  phase: 'typing' | 'saving';
  draft: TextDraft;
  /** Plain English about the document's own font, once it has been sampled. */
  note: string | null;
  /** True while the document is being read for its font. */
  matching: boolean;
}

export const INITIAL_EDITOR: EditorState = {
  phase: 'typing',
  draft: DEFAULT_DRAFT,
  note: null,
  matching: false,
};

export type EditorEvent =
  | { type: 'type'; text: string }
  | { type: 'style'; patch: Partial<TextDraft> }
  | { type: 'matchStart' }
  | { type: 'matched'; match: FontMatch }
  | { type: 'matchFailed'; note: string }
  | { type: 'commit' }
  | { type: 'commitFailed' };

/** A matched face replaces the font, and its size when the document had one. */
function applyMatch(draft: TextDraft, match: FontMatch): TextDraft {
  return {
    ...draft,
    font: match.font,
    fontSize: match.sizePt ?? draft.fontSize,
  };
}

export function editorReducer(state: EditorState, event: EditorEvent): EditorState {
  if (state.phase === 'saving' && event.type !== 'commitFailed') return state;
  switch (event.type) {
    case 'type':
      return { ...state, draft: { ...state.draft, text: event.text } };
    case 'style':
      return { ...state, draft: { ...state.draft, ...event.patch } };
    case 'matchStart':
      return { ...state, matching: true, note: null };
    case 'matched':
      return {
        ...state,
        matching: false,
        note: event.match.note,
        draft: applyMatch(state.draft, event.match),
      };
    case 'matchFailed':
      return { ...state, matching: false, note: event.note };
    case 'commit':
      return { ...state, phase: 'saving' };
    case 'commitFailed':
      return { ...state, phase: 'typing' };
  }
}

/** Nothing but whitespace is nothing to stamp — the engine refuses it too. */
export function hasText(draft: TextDraft): boolean {
  return draft.text.trim().length > 0;
}

export type CommitDecision =
  { kind: 'commit'; draft: TextDraft } | { kind: 'cancel' } | { kind: 'ignore' };

/**
 * What a commit attempt should actually do. An empty box is abandoned rather
 * than sent, and an attempt made while one is already in flight is ignored —
 * clicking away during a save must not stamp the same text twice.
 */
export function decideCommit(state: EditorState): CommitDecision {
  if (state.phase === 'saving') return { kind: 'ignore' };
  if (!hasText(state.draft)) return { kind: 'cancel' };
  return { kind: 'commit', draft: state.draft };
}

export interface EditorKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** What a keystroke means to the editor. Anything else is just typing. */
export function decideKey(event: EditorKey): 'commit' | 'cancel' | 'type' {
  if (event.key === 'Escape') return 'cancel';
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) return 'commit';
  return 'type';
}

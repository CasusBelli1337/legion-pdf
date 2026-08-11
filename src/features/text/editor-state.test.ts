/**
 * The rules the attorney feels while typing on the page: what commits, what
 * cancels, and what a keystroke arriving mid-save is allowed to change.
 */

import { describe, expect, it } from 'vitest';
import {
  decideCommit,
  decideKey,
  editorReducer,
  hasText,
  INITIAL_EDITOR,
  type EditorState,
} from './editor-state';
import type { FontMatch } from './font-match';

const typed = (text: string): EditorState => editorReducer(INITIAL_EDITOR, { type: 'type', text });

const MATCH: FontMatch = {
  font: { family: 'times', bold: true },
  documentFont: 'TimesNewRomanPS-BoldMT',
  note: 'This document uses TimesNewRomanPS-BoldMT — using Times bold, the closest built-in match.',
  exact: false,
  sizePt: 13,
};

describe('typing', () => {
  it('keeps what was typed', () => {
    expect(typed('Objection').draft.text).toBe('Objection');
  });

  it('changes the look without touching the text', () => {
    const state = editorReducer(typed('Objection'), {
      type: 'style',
      patch: { font: { family: 'courier' }, fontSize: 14 },
    });
    expect(state.draft).toEqual({
      text: 'Objection',
      fontSize: 14,
      color: '#000000',
      font: { family: 'courier' },
    });
  });
});

describe('matching the document font', () => {
  it('shows movement while the page is being read', () => {
    const state = editorReducer(typed('Note'), { type: 'matchStart' });
    expect(state.matching).toBe(true);
    expect(state.note).toBeNull();
  });

  it('applies the face and the size, and keeps the note', () => {
    const state = editorReducer(typed('Note'), { type: 'matched', match: MATCH });
    expect(state.matching).toBe(false);
    expect(state.draft.font).toEqual({ family: 'times', bold: true });
    expect(state.draft.fontSize).toBe(13);
    expect(state.note).toBe(MATCH.note);
    expect(state.draft.text).toBe('Note');
  });

  it('leaves the size alone when the document did not report one', () => {
    const sizeless: FontMatch = {
      font: MATCH.font,
      documentFont: MATCH.documentFont,
      note: MATCH.note,
      exact: MATCH.exact,
    };
    const state = editorReducer(typed('Note'), { type: 'matched', match: sizeless });
    expect(state.draft.fontSize).toBe(12);
  });

  it('says so when the page could not be read', () => {
    const state = editorReducer(editorReducer(typed('Note'), { type: 'matchStart' }), {
      type: 'matchFailed',
      note: 'no text',
    });
    expect(state.matching).toBe(false);
    expect(state.note).toBe('no text');
  });
});

describe('committing and cancelling', () => {
  it('sends the draft once there is something to send', () => {
    expect(decideCommit(typed('Objection sustained.'))).toEqual({
      kind: 'commit',
      draft: typed('Objection sustained.').draft,
    });
  });

  it('treats an empty box as a change of mind, not an edit', () => {
    expect(decideCommit(INITIAL_EDITOR)).toEqual({ kind: 'cancel' });
    expect(decideCommit(typed('   \n  '))).toEqual({ kind: 'cancel' });
  });

  it('refuses to stamp the same text twice while a save is in flight', () => {
    const saving = editorReducer(typed('Objection'), { type: 'commit' });
    expect(saving.phase).toBe('saving');
    expect(decideCommit(saving)).toEqual({ kind: 'ignore' });
  });

  it('freezes the draft while a save is in flight', () => {
    const saving = editorReducer(typed('Objection'), { type: 'commit' });
    expect(editorReducer(saving, { type: 'type', text: 'Overruled' })).toBe(saving);
    expect(editorReducer(saving, { type: 'style', patch: { fontSize: 40 } })).toBe(saving);
  });

  it('hands the box back when the save fails, with the text intact', () => {
    const saving = editorReducer(typed('Objection'), { type: 'commit' });
    const recovered = editorReducer(saving, { type: 'commitFailed' });
    expect(recovered.phase).toBe('typing');
    expect(recovered.draft.text).toBe('Objection');
    expect(decideCommit(recovered).kind).toBe('commit');
  });
});

describe('what a keystroke means', () => {
  it('commits on Ctrl+Enter and Cmd+Enter', () => {
    expect(decideKey({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe('commit');
    expect(decideKey({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe('commit');
  });

  it('keeps a plain Enter as a new line', () => {
    expect(decideKey({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe('type');
  });

  it('always abandons on Escape', () => {
    expect(decideKey({ key: 'Escape', ctrlKey: false, metaKey: false })).toBe('cancel');
    expect(decideKey({ key: 'Escape', ctrlKey: true, metaKey: false })).toBe('cancel');
  });

  it('leaves every other key to the textarea', () => {
    expect(decideKey({ key: 'a', ctrlKey: false, metaKey: false })).toBe('type');
    expect(decideKey({ key: 'Tab', ctrlKey: false, metaKey: false })).toBe('type');
  });
});

describe('whitespace is not text', () => {
  it('knows the difference', () => {
    expect(hasText({ ...INITIAL_EDITOR.draft, text: ' \n\t ' })).toBe(false);
    expect(hasText({ ...INITIAL_EDITOR.draft, text: ' x ' })).toBe(true);
  });
});

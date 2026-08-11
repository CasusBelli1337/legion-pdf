/**
 * One box being typed in: its draft, its phase, and the two things that end it.
 *
 * The box is measured FRESH from the DOM at the moment of the commit, never
 * from geometry captured when it was drawn — the document may have scrolled
 * under it in between, and a stale reading would stamp the text somewhere the
 * attorney never pointed.
 */

import { useReducer, type RefObject } from 'react';
import type { ClientPoint, PageOverlayContext } from '@renderer/components/viewer';
import type { PdfPoint, TextBoxOptions } from '@shared/types';
import {
  decideCommit,
  editorReducer,
  INITIAL_EDITOR,
  type EditorState,
  type TextDraft,
} from './editor-state';
import { matchDocumentFont, NO_TEXT_TO_MATCH, type SampledFont } from './font-match';
import { firstLineOriginClient, toTextBoxOptions, wrapWidthPt } from './text-geometry';

const UNREADABLE_FONTS = 'The fonts on this page could not be read. Choose one above instead.';

export interface EditorSessionInput {
  context: PageOverlayContext;
  /** The element that IS the drawn box, and so the measuring stick. */
  frameRef: RefObject<HTMLDivElement | null>;
  seed: TextDraft;
  clientToPdf(point: ClientPoint): PdfPoint | null;
  onCommit(options: TextBoxOptions, draft: TextDraft): Promise<boolean>;
  onCancel(): void;
  onSampleFont(): Promise<SampledFont | null>;
}

export interface EditorSession {
  state: EditorState;
  setText(text: string): void;
  setStyle(patch: Partial<TextDraft>): void;
  commit(): void;
  match(): void;
}

function boxOf(rect: DOMRect) {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** The stamp options for the box as it sits on screen right now, or null. */
function optionsFrom(
  frame: HTMLDivElement,
  context: PageOverlayContext,
  draft: TextDraft,
  clientToPdf: (point: ClientPoint) => PdfPoint | null
): TextBoxOptions | null {
  const onScreen = boxOf(frame.getBoundingClientRect());
  const origin = firstLineOriginClient(onScreen, context.scale, draft.font, draft.fontSize);
  const at = clientToPdf(origin);
  if (at === null) return null;
  return toTextBoxOptions({
    ...draft,
    page: context.page,
    at,
    wrapWidthPt: wrapWidthPt(onScreen, context.scale),
  });
}

export function useEditorSession(input: EditorSessionInput): EditorSession {
  const [state, dispatch] = useReducer(editorReducer, input.seed, (draft) => ({
    ...INITIAL_EDITOR,
    draft,
  }));
  async function commit(): Promise<void> {
    const decision = decideCommit(state);
    if (decision.kind === 'ignore') return;
    if (decision.kind === 'cancel') return input.onCancel();
    const frame = input.frameRef.current;
    if (frame === null) return;
    const options = optionsFrom(frame, input.context, decision.draft, input.clientToPdf);
    // A page that went away mid-commit keeps its text in the box rather than
    // stamping it somewhere invented.
    if (options === null) return;
    dispatch({ type: 'commit' });
    if (!(await input.onCommit(options, decision.draft))) dispatch({ type: 'commitFailed' });
  }

  async function match(): Promise<void> {
    dispatch({ type: 'matchStart' });
    try {
      const sample = await input.onSampleFont();
      if (sample === null) return dispatch({ type: 'matchFailed', note: NO_TEXT_TO_MATCH });
      dispatch({ type: 'matched', match: matchDocumentFont(sample) });
    } catch {
      dispatch({ type: 'matchFailed', note: UNREADABLE_FONTS });
    }
  }

  return {
    state,
    setText: (text) => dispatch({ type: 'type', text }),
    setStyle: (patch) => dispatch({ type: 'style', patch }),
    commit: () => void commit(),
    match: () => void match(),
  };
}

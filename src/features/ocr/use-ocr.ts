/**
 * The panel's state machine: detect when a document opens, run, stream
 * progress, cancel, and refresh the document once the text layer lands (UI
 * rule: refresh after mutation — the attorney never reloads anything).
 *
 * Every state carries the docId it belongs to, so an answer that arrives after
 * the user has switched tabs is ignored rather than shown against the wrong
 * document.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { OcrDetectResult, OcrRunDetail, ProgressEvent } from '@shared/types';
import { useAppStore } from '@renderer/app/store';
import { isCancellation, plainError } from './ocr-messages';

/** Production default: 300 DPI is what Tesseract is happiest reading. */
export const OCR_DPI = 300;
const LANGUAGE = 'eng';

export type OcrPhase = 'checking' | 'ready' | 'running' | 'done' | 'cancelled' | 'failed';

export interface OcrState {
  /** The document this state describes; anything else is stale. */
  docId: string | null;
  phase: OcrPhase;
  detected: OcrDetectResult | null;
  progress: ProgressEvent | null;
  detail: OcrRunDetail | null;
  error: string | null;
}

const BLANK: OcrState = {
  docId: null,
  phase: 'checking',
  detected: null,
  progress: null,
  detail: null,
  error: null,
};

export interface OcrController {
  state: OcrState;
  start(pages: number[]): void;
  cancel(): void;
  recheck(): void;
}

type SetOcrState = Dispatch<SetStateAction<OcrState>>;

/** Detect on open and on demand; state only ever changes in an async callback. */
function useDetection(docId: string | null): {
  state: OcrState;
  setState: SetOcrState;
  recheck: () => void;
} {
  const [state, setState] = useState<OcrState>(BLANK);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (docId === null) return;
    let current = true;
    void window.librarius.ocr
      .detect(docId)
      .then((detected) => {
        if (current) setState({ ...BLANK, docId, phase: 'ready', detected });
      })
      .catch((error: unknown) => {
        if (current) setState({ ...BLANK, docId, phase: 'failed', error: plainError(error) });
      });
    return () => {
      current = false;
    };
  }, [docId, attempt]);

  const recheck = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, setState, recheck };
}

function useProgressStream(docId: string | null, setState: SetOcrState): void {
  useEffect(() => {
    if (docId === null) return;
    return window.librarius.onProgress('ocr:progress', (event) => {
      if (event.docId !== docId) return;
      setState((previous) =>
        previous.docId === docId ? { ...previous, progress: event } : previous
      );
    });
  }, [docId, setState]);
}

function useStart(docId: string | null, setState: SetOcrState): (pages: number[]) => void {
  const replaceSession = useAppStore((store) => store.replaceSession);
  return useCallback(
    (pages: number[]): void => {
      if (docId === null || pages.length === 0) return;
      setState((previous) => ({
        ...previous,
        docId,
        phase: 'running',
        progress: null,
        error: null,
      }));
      void window.librarius.ocr
        .run(docId, { pages, language: LANGUAGE, dpi: OCR_DPI })
        .then(async (result) => {
          replaceSession(await window.librarius.file.read(docId));
          const detected = await window.librarius.ocr.detect(docId);
          setState({ ...BLANK, docId, phase: 'done', detected, detail: result.detail });
        })
        .catch((error: unknown) => {
          const cancelled = isCancellation(error);
          setState((previous) => ({
            ...previous,
            docId,
            phase: cancelled ? 'cancelled' : 'failed',
            progress: null,
            error: cancelled ? null : plainError(error),
          }));
        });
    },
    [docId, replaceSession, setState]
  );
}

export function useOcr(docId: string | null): OcrController {
  const { state, setState, recheck } = useDetection(docId);
  useProgressStream(docId, setState);
  const start = useStart(docId, setState);
  const cancel = useCallback((): void => {
    if (docId !== null) void window.librarius.ocr.cancel(docId);
  }, [docId]);

  return {
    state: state.docId === docId ? state : { ...BLANK, docId },
    start,
    cancel,
    recheck,
  };
}

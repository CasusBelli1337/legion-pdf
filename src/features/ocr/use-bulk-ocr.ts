/**
 * The "OCR multiple files" state machine: choose files, choose where the
 * finished copies go, run, watch, cancel, read the receipt.
 *
 * Bulk progress arrives on the same `ocr:progress` channel as a single-document
 * run but with `docId: null` — that is how the two are told apart, so a bulk run
 * never drives the open tab's progress bar and vice versa.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BulkOcrFileResult, ProgressEvent } from '@shared/types';
import { plainError } from './ocr-messages';
import type { LiveStatus } from './bulk-ocr-messages';

export type BulkPhase = 'idle' | 'running' | 'done';

export interface BulkOcrState {
  phase: BulkPhase;
  paths: string[];
  /** null = write each searchable copy beside its original. */
  outputDir: string | null;
  overwrite: boolean;
  progress: ProgressEvent | null;
  files: BulkOcrFileResult[];
  error: string | null;
}

export interface BulkOcrController {
  state: BulkOcrState;
  /** Live status of one chosen file while the run is going. */
  liveStatus(index: number): LiveStatus;
  chooseFiles(): void;
  chooseOutputFolder(): void;
  useOriginalFolders(): void;
  setOverwrite(overwrite: boolean): void;
  clearFiles(): void;
  start(): void;
  cancel(): void;
}

const BLANK: BulkOcrState = {
  phase: 'idle',
  paths: [],
  outputDir: null,
  overwrite: false,
  progress: null,
  files: [],
  error: null,
};

type SetBulkState = Dispatch<SetStateAction<BulkOcrState>>;

function useBulkProgress(setState: SetBulkState): void {
  useEffect(() => {
    return window.librarius.onProgress('ocr:progress', (event) => {
      // A null docId is the bulk run's signature: this work belongs to no tab.
      if (event.docId !== null) return;
      setState((previous) =>
        previous.phase === 'running' ? { ...previous, progress: event } : previous
      );
    });
  }, [setState]);
}

/** The two native pickers: which files, and where the finished copies land. */
function usePickers(
  setState: SetBulkState
): Pick<BulkOcrController, 'chooseFiles' | 'chooseOutputFolder'> {
  const report = useCallback(
    (error: unknown): void => {
      setState((previous) => ({ ...previous, error: plainError(error) }));
    },
    [setState]
  );

  const chooseFiles = useCallback((): void => {
    void window.librarius.file
      .openDialog()
      .then((paths) => {
        if (paths.length === 0) return;
        setState((previous) => ({ ...previous, phase: 'idle', paths, files: [], error: null }));
      })
      .catch(report);
  }, [setState, report]);

  const chooseOutputFolder = useCallback((): void => {
    void window.librarius.file
      .chooseFolder()
      .then((outputDir) => {
        if (outputDir === null) return;
        setState((previous) => ({ ...previous, outputDir }));
      })
      .catch(report);
  }, [setState, report]);

  return { chooseFiles, chooseOutputFolder };
}

function useStartRun(state: BulkOcrState, setState: SetBulkState): () => void {
  const { phase, paths, outputDir, overwrite } = state;
  return useCallback((): void => {
    if (phase === 'running' || paths.length === 0) return;
    setState((previous) => ({
      ...previous,
      phase: 'running',
      progress: null,
      files: [],
      error: null,
    }));
    void window.librarius.ocr
      .bulk(paths, { overwrite, ...(outputDir === null ? {} : { outputDir }) })
      .then((result) => {
        setState((current) => ({
          ...current,
          phase: 'done',
          progress: null,
          files: result.files,
        }));
      })
      .catch((error: unknown) => {
        setState((current) => ({
          ...current,
          phase: 'idle',
          progress: null,
          error: plainError(error),
        }));
      });
  }, [phase, paths, outputDir, overwrite, setState]);
}

export function useBulkOcr(): BulkOcrController {
  const [state, setState] = useState<BulkOcrState>(BLANK);
  useBulkProgress(setState);
  const { chooseFiles, chooseOutputFolder } = usePickers(setState);
  const start = useStartRun(state, setState);
  const cancel = useCallback((): void => {
    void window.librarius.ocr.bulkCancel();
  }, []);

  return {
    state,
    liveStatus: (index) => liveStatusFor(state, index),
    chooseFiles,
    chooseOutputFolder,
    useOriginalFolders: () => setState((previous) => ({ ...previous, outputDir: null })),
    setOverwrite: (overwrite) => setState((previous) => ({ ...previous, overwrite })),
    clearFiles: () => setState((previous) => ({ ...BLANK, outputDir: previous.outputDir })),
    start,
    cancel,
  };
}

/**
 * `progress.current` is the 1-based file the run is on. Everything before it has
 * been dealt with one way or another — how, only the receipt can say.
 */
function liveStatusFor(state: BulkOcrState, index: number): LiveStatus {
  if (state.phase !== 'running') return 'waiting';
  const active = (state.progress?.current ?? 1) - 1;
  if (index < active) return 'finished';
  return index === active ? 'working' : 'waiting';
}

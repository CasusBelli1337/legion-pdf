/**
 * The Export panel's state machine: pick a format, pick a destination, run,
 * watch it move, stop it, read the receipt.
 *
 * Two rules shape it. Every state carries the docId it belongs to, so an answer
 * that lands after the attorney switched tabs is ignored rather than shown
 * against the wrong document. And a stop is recognised because THIS panel asked
 * for it — the sentence main sends back is copy for the attorney to read, never
 * a protocol for the renderer to parse.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { exportFormatInfo } from '@shared/export-formats';
import type {
  ExportColorMode,
  ExportFormat,
  ExportOptions,
  ExportResult,
  ProgressEvent,
  ScanPictureMode,
} from '@shared/types';
import { ALL_PAGES } from '@renderer/features/stamps';
import { plainExportError, suggestedName } from './export-messages';
import { exportMemory, rememberExport } from './export-settings';

export type ExportPhase = 'idle' | 'running' | 'done' | 'stopped' | 'failed';

export interface ExportForm {
  format: ExportFormat;
  /** "all" or "1-30, 45", exactly as typed. */
  range: string;
  dpi: number;
  color: ExportColorMode;
  quality: number;
  /** Word only: what becomes of a scanned page's picture. */
  scanPictures: ScanPictureMode;
  /** The folder or file the attorney chose, or null while nothing is chosen. */
  outputPath: string | null;
}

export interface ExportState {
  docId: string | null;
  phase: ExportPhase;
  progress: ProgressEvent | null;
  result: ExportResult | null;
  error: string | null;
}

export interface ExportController {
  state: ExportState;
  form: ExportForm;
  update(patch: Partial<ExportForm>): void;
  choose(): void;
  start(pages: readonly number[]): void;
  cancel(): void;
}

const IDLE: ExportState = { docId: null, phase: 'idle', progress: null, result: null, error: null };

function openingForm(): ExportForm {
  return { ...exportMemory.read(), range: ALL_PAGES, outputPath: null };
}

/** A format change invalidates the destination: a folder is not a file. */
function applyPatch(form: ExportForm, patch: Partial<ExportForm>): ExportForm {
  const next = { ...form, ...patch };
  if (patch.format !== undefined && patch.format !== form.format) next.outputPath = null;
  rememberExport(next);
  return next;
}

export function exportOptionsFrom(form: ExportForm): ExportOptions {
  const info = exportFormatInfo(form.format);
  const options: ExportOptions = {
    format: form.format,
    outputPath: form.outputPath ?? '',
    pages: form.range,
  };
  if (info.raster) {
    options.dpi = form.dpi;
    options.color = form.color;
  }
  if (form.format === 'jpeg') options.quality = form.quality;
  if (form.format === 'docx') options.scanPictures = form.scanPictures;
  return options;
}

type SetForm = Dispatch<SetStateAction<ExportForm>>;
type SetState = Dispatch<SetStateAction<ExportState>>;

function useProgressStream(docId: string | null, setState: SetState): void {
  useEffect(() => {
    if (docId === null) return;
    return window.librarius.onProgress('export:progress', (event) => {
      if (event.docId !== docId) return;
      setState((previous) =>
        previous.docId === docId ? { ...previous, progress: event } : previous
      );
    });
  }, [docId, setState]);
}

interface ActionDeps {
  docId: string | null;
  fileName: string;
  form: ExportForm;
  setForm: SetForm;
  setState: SetState;
}

type ExportActions = Pick<ExportController, 'choose' | 'start' | 'cancel'>;

/** Choose, run, stop — the three things that talk to the main process. */
function useExportActions({ docId, fileName, form, setForm, setState }: ActionDeps): ExportActions {
  const stopped = useRef(false);

  const fail = useCallback(
    (error: unknown) =>
      setState({
        docId,
        phase: stopped.current ? 'stopped' : 'failed',
        progress: null,
        result: null,
        error: plainExportError(error),
      }),
    [docId, setState]
  );

  const choose = useCallback(() => {
    void window.librarius.export
      .chooseOutput(form.format, suggestedName(fileName, form.format))
      .then((chosen) => {
        if (chosen !== null) setForm((previous) => ({ ...previous, outputPath: chosen }));
      })
      .catch(fail);
  }, [fail, fileName, form.format, setForm]);

  const start = useCallback(
    (pages: readonly number[]) => {
      if (docId === null || form.outputPath === null || pages.length === 0) return;
      stopped.current = false;
      setState({ docId, phase: 'running', progress: null, result: null, error: null });
      void window.librarius.export
        .run(docId, exportOptionsFrom(form))
        .then((result) => setState({ docId, phase: 'done', progress: null, result, error: null }))
        .catch(fail);
    },
    [docId, fail, form, setState]
  );

  const cancel = useCallback(() => {
    if (docId === null) return;
    stopped.current = true;
    void window.librarius.export.cancel(docId);
  }, [docId]);

  return { choose, start, cancel };
}

export function useExport(docId: string | null, fileName: string): ExportController {
  const [form, setForm] = useState<ExportForm>(openingForm);
  const [state, setState] = useState<ExportState>(IDLE);
  const [shownDocId, setShownDocId] = useState<string | null>(docId);

  // Switching tabs clears the destination and the page range — last document's
  // folder is exactly the wrong default for this one. Adjusted during render
  // rather than in an effect, so the form never flashes the old document's
  // answers (React: "adjusting state when a prop changes").
  if (shownDocId !== docId) {
    setShownDocId(docId);
    setForm((previous) => ({ ...previous, range: ALL_PAGES, outputPath: null }));
  }

  useProgressStream(docId, setState);
  const actions = useExportActions({ docId, fileName, form, setForm, setState });

  return {
    state: state.docId === docId ? state : { ...IDLE, docId },
    form,
    update: useCallback(
      (patch: Partial<ExportForm>) => setForm((previous) => applyPatch(previous, patch)),
      []
    ),
    ...actions,
  };
}

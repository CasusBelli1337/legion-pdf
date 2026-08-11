/**
 * The marked state, held outside the panel component on purpose.
 *
 * A dock panel unmounts the moment the attorney switches tools, and marks that
 * vanish because someone looked at the Bates panel would be worse than no marks
 * at all. So marking lives here, keyed to the document it belongs to: switching
 * DOCUMENTS clears it — carrying marks onto a different file is how the wrong
 * page gets destroyed — and switching tools does not.
 *
 * Marked state is reversible; only apply is not.
 */

import { create } from 'zustand';
import type {
  PdfRect,
  ProgressEvent,
  RedactVerifyResult,
  RedactionBox,
  TextMatch,
} from '@shared/types';
import { marksFromMatches } from './mark-geometry';

export type RedactPhase = 'idle' | 'running' | 'done' | 'failed';

/**
 * One run, kept beside the marks rather than inside the panel. The receipt
 * outlives the tab switch: applying opens the redacted document in a new tab
 * and makes it active, and a receipt that disappeared at that exact moment
 * would be a proof the attorney never got to read.
 */
export interface RedactionRun {
  phase: RedactPhase;
  /** The document the marks came from. Progress events are matched to it. */
  sourceDocId: string | null;
  /** The redacted document, once main has adopted it. */
  resultDocId: string | null;
  progress: ProgressEvent | null;
  receipt: RedactVerifyResult | null;
  error: string | null;
}

const IDLE_RUN: RedactionRun = {
  phase: 'idle',
  sourceDocId: null,
  resultDocId: null,
  progress: null,
  receipt: null,
  error: null,
};

export interface RedactionState {
  /** The document these marks belong to. Anything else is a different file. */
  docId: string | null;
  marks: RedactionBox[];
  selectedId: string | null;
  /** True while the draw tool is armed and the page accepts a new box. */
  drawing: boolean;
  /** Keep the rebuilt pages searchable by re-reading the burned raster. */
  reOcr: boolean;
  run: RedactionRun;

  forDocument(docId: string | null): void;
  startRun(sourceDocId: string): void;
  noteProgress(progress: ProgressEvent): void;
  noteResultDocument(resultDocId: string): void;
  finishRun(receipt: RedactVerifyResult): void;
  failRun(error: string): void;
  resetRun(): void;
  addMark(page: number, rect: PdfRect): void;
  updateMark(id: string, rect: PdfRect): void;
  removeMark(id: string): void;
  clearMarks(): void;
  selectMark(id: string | null): void;
  markMatches(matches: readonly TextMatch[]): void;
  setDrawing(drawing: boolean): void;
  setReOcr(reOcr: boolean): void;
}

/**
 * On by default (F-7). Off, a redacted production comes back as a pure 300 DPI
 * picture that extracts to nothing, and an attorney only finds out downstream.
 * The destruction is identical either way — the re-OCR path is verified after
 * the new text layer is written — so the searchable output is the safe default.
 */
export const SEARCHABLE_BY_DEFAULT = true;

let counter = 0;

function nextId(): string {
  counter += 1;
  return `mark-${counter}`;
}

/** Distinct 1-based pages carrying at least one mark, ascending. */
export function pagesOf(marks: readonly RedactionBox[]): number[] {
  return [...new Set(marks.map((mark) => mark.page))].sort((left, right) => left - right);
}

/**
 * The text of every search hit that was marked — exactly what the verification
 * pass is asked to prove absent. Hand-drawn boxes contribute nothing here, and
 * are proved by the page-level check instead.
 */
export function verifyStringsOf(marks: readonly RedactionBox[]): string[] {
  const seen = new Map<string, string>();
  for (const mark of marks) {
    const text = mark.sourceMatch?.text.trim() ?? '';
    if (text.length > 0 && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
  }
  return [...seen.values()];
}

/** Marks already covering the same page and rectangle, so re-marking is a no-op. */
function withoutDuplicates(
  existing: readonly RedactionBox[],
  added: readonly RedactionBox[]
): RedactionBox[] {
  const key = (mark: RedactionBox): string =>
    `${mark.page}:${mark.rect.x.toFixed(2)}:${mark.rect.y.toFixed(2)}:` +
    `${mark.rect.width.toFixed(2)}:${mark.rect.height.toFixed(2)}`;
  const known = new Set(existing.map(key));
  return added.filter((mark) => !known.has(key(mark)));
}

/** The receipt survives a move to the document the run produced, or back. */
function runFor(run: RedactionRun, docId: string | null): RedactionRun {
  const belongs = run.resultDocId === docId || run.sourceDocId === docId;
  return belongs ? run : IDLE_RUN;
}

type Setter = (
  updater: Partial<RedactionState> | ((state: RedactionState) => Partial<RedactionState>)
) => void;

type RunActions = Pick<
  RedactionState,
  'startRun' | 'noteProgress' | 'noteResultDocument' | 'finishRun' | 'failRun' | 'resetRun'
>;

function runActions(set: Setter): RunActions {
  return {
    startRun: (sourceDocId) => set({ run: { ...IDLE_RUN, phase: 'running', sourceDocId } }),

    noteProgress: (progress) =>
      set((state) => (state.run.phase === 'running' ? { run: { ...state.run, progress } } : state)),

    noteResultDocument: (resultDocId) => set((state) => ({ run: { ...state.run, resultDocId } })),

    /** A finished run clears the marks: they have been destroyed, not lost. */
    finishRun: (receipt) =>
      set((state) => ({
        run: { ...state.run, phase: 'done', progress: null, receipt, error: null },
        marks: [],
        selectedId: null,
        drawing: false,
      })),

    failRun: (error) =>
      set((state) => ({ run: { ...state.run, phase: 'failed', progress: null, error } })),

    resetRun: () => set({ run: IDLE_RUN }),
  };
}

export const useRedactionStore = create<RedactionState>((set) => ({
  docId: null,
  marks: [],
  selectedId: null,
  drawing: false,
  reOcr: SEARCHABLE_BY_DEFAULT,
  run: IDLE_RUN,
  ...runActions(set),

  forDocument: (docId) =>
    set((state) =>
      state.docId === docId
        ? state
        : {
            docId,
            marks: [],
            selectedId: null,
            drawing: false,
            reOcr: state.reOcr,
            run: runFor(state.run, docId),
          }
    ),

  addMark: (page, rect) =>
    set((state) => {
      const mark: RedactionBox = { id: nextId(), page, rect };
      return { marks: [...state.marks, mark], selectedId: mark.id };
    }),

  updateMark: (id, rect) =>
    set((state) => ({
      marks: state.marks.map((mark) => (mark.id === id ? { ...mark, rect } : mark)),
    })),

  removeMark: (id) =>
    set((state) => ({
      marks: state.marks.filter((mark) => mark.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  clearMarks: () => set({ marks: [], selectedId: null }),

  selectMark: (selectedId) => set({ selectedId }),

  markMatches: (matches) =>
    set((state) => ({
      marks: [...state.marks, ...withoutDuplicates(state.marks, marksFromMatches(matches))],
      selectedId: null,
    })),

  setDrawing: (drawing) => set({ drawing }),
  setReOcr: (reOcr) => set({ reOcr }),
}));

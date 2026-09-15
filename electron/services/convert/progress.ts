/**
 * Where "Converting letter.docx" goes on its way to the status bar.
 *
 * A conversion runs deep inside `file:open` and `ops:merge`, under a document
 * that does not exist yet, so there is no docId to thread a reporter through and
 * no handler in the middle to hold one. The convert IPC module installs the sink
 * once at startup (`electron/ipc/convert.ts`); everything below it just reports.
 * One main process, one window, one sink.
 *
 * The denominator is remembered so the closing event can match it. A multi-page
 * TIFF reports "1 of 3, 2 of 3, 3 of 3" from inside the engine, and finishing at
 * "1 of 1" would read on screen as the counter jumping backwards — which is the
 * UI rule about counters agreeing, in miniature.
 */

export type ConvertProgressSink = (phase: string, current: number, total: number) => void;

let sink: ConvertProgressSink = () => undefined;
let lastTotal = 1;

export function setConvertProgressSink(next: ConvertProgressSink): void {
  sink = next;
}

/** Never throws: a failing progress listener must not fail the conversion. */
export function reportConvertProgress(phase: string, current: number, total: number): void {
  lastTotal = Math.max(1, total);
  emit(phase, current, lastTotal);
}

/** The finished event, at whatever scale the work actually turned out to use. */
export function finishConvertProgress(phase: string): void {
  emit(phase, lastTotal, lastTotal);
}

function emit(phase: string, current: number, total: number): void {
  try {
    sink(phase, current, total);
  } catch {
    // Progress is decoration; the document is the point.
  }
}

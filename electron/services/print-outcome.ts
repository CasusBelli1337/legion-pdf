/**
 * Reading `webContents.print`'s callback, which reports a cancelled print and a
 * broken printer through the SAME two arguments.
 *
 * Chromium hands back `(success, failureReason)`. Backing out of the system
 * print dialog arrives as `success: false` with a reason that merely says so —
 * Electron 43 sends the literal string `Print job canceled` (the American
 * spelling; earlier builds sent `cancelled`, and some paths send nothing at
 * all). Treating that as a failure put `COULD NOT PRINT: PRINT JOB CANCELED`
 * in the footer in red after a perfectly ordinary cancel (F-5).
 *
 * So the reason is CLASSIFIED rather than compared: anything that says cancelled
 * — either spelling — and an empty reason are both the attorney changing their
 * mind, which is a non-event. Everything else is a real failure and keeps the
 * error styling: no printer, bad settings, a failed render.
 */

/** Cancelled: the attorney backed out. Failed: something actually went wrong. */
export type PrintOutcome = 'printed' | 'cancelled' | 'failed';

const CANCELLED = /cancell?ed/i;

export function printOutcome(success: boolean, failureReason?: string | null): PrintOutcome {
  if (success) return 'printed';
  const reason = (failureReason ?? '').trim();
  // No reason at all is never evidence of a fault; a fault always names itself.
  if (reason === '' || CANCELLED.test(reason)) return 'cancelled';
  return 'failed';
}

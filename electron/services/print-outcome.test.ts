import { describe, expect, it } from 'vitest';
import { printOutcome } from './print-outcome';

/**
 * F-5. Cancelling the print dialog put `COULD NOT PRINT: PRINT JOB CANCELED` in
 * the footer, in red. The old guard compared the reason to the single literal
 * `'cancelled'`, and Electron 43 sends `Print job canceled` — one spelling and
 * three words away, so every cancel read as a failure.
 */
describe('reading the print callback', () => {
  it('is a printed job when Chromium says it succeeded', () => {
    expect(printOutcome(true, '')).toBe('printed');
  });

  it.each([
    'Print job canceled',
    'Print job cancelled',
    'cancelled',
    'canceled',
    'CANCELLED',
    'Printing was cancelled by the user',
  ])('reads %j as the attorney backing out, not a fault', (reason) => {
    expect(printOutcome(false, reason)).toBe('cancelled');
  });

  // Some paths report the failure arguments with nothing in them at all. A real
  // fault always names itself, so silence is a cancel.
  it.each([['' as string | null | undefined], [' '], [null], [undefined]])(
    'reads an empty reason (%j) as a cancel',
    (reason) => {
      expect(printOutcome(false, reason)).toBe('cancelled');
    }
  );

  it.each([
    'Printing failed',
    'Invalid printer settings',
    'Invalid deviceName provided',
    'PDF generation failed',
  ])('keeps %j a real failure, so it still shows as an error', (reason) => {
    expect(printOutcome(false, reason)).toBe('failed');
  });
});

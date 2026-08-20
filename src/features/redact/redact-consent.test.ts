/**
 * Consent, which in this lane is the difference between a redaction and an
 * accident. Both decisions are pinned here: the panel button that must not
 * destroy anything until it is confirmed, and the save-time gate's three
 * answers — including the one that saves the redacted COPY instead of the
 * document the attorney pressed Save on.
 */

import { describe, expect, it, vi } from 'vitest';
import type { RedactionBox } from '@shared/types';
import { runRedactionGate, withDestroyConsent } from './redact-consent';

function mark(id: string, page: number): RedactionBox {
  return { id, page, rect: { x: 10, y: 20, width: 100, height: 12 } };
}

const TWO_MARKS_ONE_PAGE = [mark('a', 3), mark('b', 3)];
const THREE_MARKS_TWO_PAGES = [mark('a', 3), mark('b', 3), mark('c', 7)];

describe('the panel confirmation', () => {
  it('destroys nothing until the attorney confirms', async () => {
    const destroy = vi.fn();
    const agreed = await withDestroyConsent(THREE_MARKS_TWO_PAGES, async () => false, destroy);

    expect(agreed).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('destroys once, and only once, when the attorney confirms', async () => {
    const destroy = vi.fn();
    const agreed = await withDestroyConsent(THREE_MARKS_TWO_PAGES, async () => true, destroy);

    expect(agreed).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('never raises the question with nothing marked', async () => {
    const confirm = vi.fn(async () => true);
    const destroy = vi.fn();

    expect(await withDestroyConsent([], confirm, destroy)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  // "3 marked areas on 2 pages" — the count is the whole point of the sentence.
  it('counts the marks and the pages they sit on', async () => {
    const confirm = vi.fn(async () => true);
    await withDestroyConsent(THREE_MARKS_TWO_PAGES, confirm, vi.fn());
    expect(confirm).toHaveBeenCalledWith(3, 2);

    confirm.mockClear();
    await withDestroyConsent(TWO_MARKS_ONE_PAGE, confirm, vi.fn());
    expect(confirm).toHaveBeenCalledWith(2, 1);
  });
});

describe('the save-time gate', () => {
  it('lets an ordinary save straight through, with no dialog at all', async () => {
    const ask = vi.fn(async () => 'cancel' as const);
    const applyAndSaveCopy = vi.fn(async () => undefined);

    expect(await runRedactionGate({ marks: [], ask, applyAndSaveCopy })).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('saves the document as it stands when the attorney keeps the marks', async () => {
    const applyAndSaveCopy = vi.fn(async () => undefined);
    const mayProceed = await runRedactionGate({
      marks: THREE_MARKS_TWO_PAGES,
      ask: async () => 'save-anyway',
      applyAndSaveCopy,
    });

    expect(mayProceed).toBe(true);
    expect(applyAndSaveCopy).not.toHaveBeenCalled();
  });

  it('saves nothing and destroys nothing on cancel', async () => {
    const applyAndSaveCopy = vi.fn(async () => undefined);
    const mayProceed = await runRedactionGate({
      marks: THREE_MARKS_TWO_PAGES,
      ask: async () => 'cancel',
      applyAndSaveCopy,
    });

    expect(mayProceed).toBe(false);
    expect(applyAndSaveCopy).not.toHaveBeenCalled();
  });

  /**
   * The audit-critical branch. Applying at save time saves the REDACTED COPY to
   * the destination the attorney picks; letting the original save run on
   * afterwards would write the unredacted source over that very file.
   */
  it('stops the original save once the redacted copy has been saved in its place', async () => {
    const applyAndSaveCopy = vi.fn(async () => undefined);
    const mayProceed = await runRedactionGate({
      marks: THREE_MARKS_TWO_PAGES,
      ask: async () => 'apply',
      applyAndSaveCopy,
    });

    expect(applyAndSaveCopy).toHaveBeenCalledTimes(1);
    expect(mayProceed).toBe(false);
  });

  it('waits for the redaction and its save to finish before answering', async () => {
    const order: string[] = [];
    const applyAndSaveCopy = async (): Promise<void> => {
      order.push('start');
      await Promise.resolve();
      order.push('end');
    };

    await runRedactionGate({
      marks: TWO_MARKS_ONE_PAGE,
      ask: async () => 'apply',
      applyAndSaveCopy,
    });
    expect(order).toEqual(['start', 'end']);
  });

  it('tells the dialog how many marks are pending, and on how many pages', async () => {
    const ask = vi.fn(async () => 'cancel' as const);
    await runRedactionGate({
      marks: THREE_MARKS_TWO_PAGES,
      ask,
      applyAndSaveCopy: async () => undefined,
    });
    expect(ask).toHaveBeenCalledWith(3, 2);
  });
});

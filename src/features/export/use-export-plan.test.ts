import { describe, expect, it } from 'vitest';
import { PLAN_DEBOUNCE_MS, planApplies } from './use-export-plan';

describe('when the panel asks what the export will do', () => {
  it('asks only for Word, and only with a document open', () => {
    expect(planApplies('doc-1', 'docx')).toBe(true);
    expect(planApplies('doc-1', 'png')).toBe(false);
    expect(planApplies('doc-1', 'txt')).toBe(false);
    expect(planApplies(null, 'docx')).toBe(false);
  });

  it('waits for the typing to stop, but not long enough to feel slow', () => {
    expect(PLAN_DEBOUNCE_MS).toBeGreaterThanOrEqual(200);
    expect(PLAN_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });
});

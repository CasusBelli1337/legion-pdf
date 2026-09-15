import { describe, expect, it } from 'vitest';
import { tabLabel } from './tab-label';

/**
 * Arthur: "the name displayed in the tab isn't the actual name of the PDF."
 * A tail-truncated tab was one of the ways that happened — two documents whose
 * names differ only in their SUFFIX rendered as the same string.
 */
describe('what a tab shows of a long file name', () => {
  it('leaves a name that fits exactly as it is', () => {
    expect(tabLabel('Deposition.pdf', 34)).toBe('Deposition.pdf');
  });

  it('keeps the end, which is what tells two documents apart', () => {
    const original = 'Smith v Jones - Deposition of Jane Roe Vol 1.pdf';
    const redacted = 'Smith v Jones - Deposition of Jane Roe Vol 1 (redacted).pdf';

    expect(tabLabel(original, 34)).not.toBe(tabLabel(redacted, 34));
    expect(tabLabel(redacted, 34)).toContain('(redacted).pdf');
  });

  it('never gives back more characters than the tab has room for', () => {
    const shown = tabLabel('Smith v Jones - Deposition of Jane Roe Vol 1.pdf', 34);

    expect(shown.length).toBe(34);
    expect(shown).toContain('…');
  });

  it('survives a nonsense limit rather than slicing the name to nothing', () => {
    expect(tabLabel('Deposition.pdf', 0)).toBe('Deposition.pdf');
    expect(tabLabel('Deposition.pdf', 1)).toBe('Deposition.pdf');
  });
});

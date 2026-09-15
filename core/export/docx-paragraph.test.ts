import { describe, expect, it } from 'vitest';
import { healsHyphen } from './docx-paragraph';

describe('healsHyphen', () => {
  it('heals a word the typesetter broke and keeps a hyphen the word owns', () => {
    expect(healsHyphen('the signa-', 'ture page')).toBe(true);
    expect(healsHyphen('after two meet-and-', 'confer letters')).toBe(false);
    expect(healsHyphen('a self-', 'employed witness')).toBe(false);
    expect(healsHyphen('the cross-', 'complaint')).toBe(false);
  });

  it('never heals across a capital, a number, or a line that did not end in a hyphen', () => {
    expect(healsHyphen('Santa Clara-', 'Based firm')).toBe(false);
    expect(healsHyphen('section 2030-', '300')).toBe(false);
    expect(healsHyphen('no hyphen here', 'next line')).toBe(false);
  });
});

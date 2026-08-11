import { describe, expect, it } from 'vitest';
import { nextExhibitLabel } from './exhibit-label';

/**
 * The same cases core/stamps/exhibit-label.test.ts runs. The two
 * implementations exist because the renderer cannot import core; these tests
 * are what keeps them honest about agreeing.
 */
describe('nextExhibitLabel', () => {
  it('rolls Z over to AA', () => {
    expect(nextExhibitLabel('A')).toBe('B');
    expect(nextExhibitLabel('Z')).toBe('AA');
    expect(nextExhibitLabel('AA')).toBe('AB');
    expect(nextExhibitLabel('AZ')).toBe('BA');
    expect(nextExhibitLabel('ZZ')).toBe('AAA');
  });

  it('carries the rest of the label and its case', () => {
    expect(nextExhibitLabel('EXHIBIT A')).toBe('EXHIBIT B');
    expect(nextExhibitLabel('EXHIBIT Z')).toBe('EXHIBIT AA');
    expect(nextExhibitLabel('Exhibit a')).toBe('Exhibit b');
  });

  it('advances numbered exhibits, keeping their padding', () => {
    expect(nextExhibitLabel('Exhibit 1')).toBe('Exhibit 2');
    expect(nextExhibitLabel('Exhibit 09')).toBe('Exhibit 10');
  });

  it('leaves a label with nothing to count on alone', () => {
    expect(nextExhibitLabel('Exhibit')).toBeNull();
    expect(nextExhibitLabel('')).toBeNull();
  });
});

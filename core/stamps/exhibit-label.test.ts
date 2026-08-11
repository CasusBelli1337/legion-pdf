import { describe, expect, it } from 'vitest';
import {
  advanceExhibitLabel,
  exhibitSequence,
  letterToOrdinal,
  nextExhibitLabel,
  ordinalToLetter,
} from './exhibit-label';

describe('letters and ordinals', () => {
  it('counts bijectively — there is no zero letter', () => {
    expect(letterToOrdinal('A')).toBe(1);
    expect(letterToOrdinal('Z')).toBe(26);
    expect(letterToOrdinal('AA')).toBe(27);
    expect(letterToOrdinal('AZ')).toBe(52);
    expect(letterToOrdinal('BA')).toBe(53);
    expect(letterToOrdinal('ZZ')).toBe(702);
  });

  it('round-trips every ordinal up to three letters', () => {
    for (const ordinal of [1, 26, 27, 52, 53, 702, 703, 17576]) {
      expect(letterToOrdinal(ordinalToLetter(ordinal))).toBe(ordinal);
    }
  });

  it('refuses a position before the first exhibit', () => {
    expect(() => ordinalToLetter(0)).toThrow(/start at 1/);
  });
});

describe('nextExhibitLabel', () => {
  it('rolls Z over to AA the way an exhibit list does', () => {
    expect(nextExhibitLabel('A')).toBe('B');
    expect(nextExhibitLabel('Y')).toBe('Z');
    expect(nextExhibitLabel('Z')).toBe('AA');
    expect(nextExhibitLabel('AA')).toBe('AB');
    expect(nextExhibitLabel('AZ')).toBe('BA');
    expect(nextExhibitLabel('ZZ')).toBe('AAA');
  });

  it('carries the rest of the label along', () => {
    expect(nextExhibitLabel('EXHIBIT A')).toBe('EXHIBIT B');
    expect(nextExhibitLabel('EXHIBIT Z')).toBe('EXHIBIT AA');
    expect(nextExhibitLabel('Exhibit a')).toBe('Exhibit b');
    expect(nextExhibitLabel('Plaintiff Exhibit A')).toBe('Plaintiff Exhibit B');
  });

  it('advances numbered exhibits too, keeping their padding', () => {
    expect(nextExhibitLabel('Exhibit 1')).toBe('Exhibit 2');
    expect(nextExhibitLabel('Exhibit 09')).toBe('Exhibit 10');
    expect(nextExhibitLabel('Exhibit 99')).toBe('Exhibit 100');
  });

  it('refuses a label with nothing to count on', () => {
    expect(() => nextExhibitLabel('Exhibit')).toThrow(/does not end in an exhibit letter/);
    expect(() => nextExhibitLabel('')).toThrow(/does not end in an exhibit letter/);
  });
});

describe('exhibitSequence', () => {
  it('produces the run a stack of files is stamped with', () => {
    expect(exhibitSequence('EXHIBIT A', 3)).toEqual(['EXHIBIT A', 'EXHIBIT B', 'EXHIBIT C']);
    expect(exhibitSequence('Y', 4)).toEqual(['Y', 'Z', 'AA', 'AB']);
  });

  it('holds still at an offset of zero', () => {
    expect(advanceExhibitLabel('EXHIBIT Q', 0)).toBe('EXHIBIT Q');
  });

  it('refuses an empty run', () => {
    expect(() => exhibitSequence('A', 0)).toThrow(/at least one label/);
  });
});

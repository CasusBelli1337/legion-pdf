import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, otherTheme, resolveTheme, switchThemeLabel } from './theme';

describe('the stored theme', () => {
  it('defaults to light, because the app ships to attorneys', () => {
    expect(DEFAULT_THEME).toBe('light');
  });

  it('takes either theme name back verbatim', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('treats a first run as light', () => {
    expect(resolveTheme(null)).toBe('light');
    expect(resolveTheme(undefined)).toBe('light');
  });

  it('treats a corrupt value as a first run rather than a broken screen', () => {
    expect(resolveTheme('DARK')).toBe('light');
    expect(resolveTheme('{"theme":"dark"}')).toBe('light');
    expect(resolveTheme('')).toBe('light');
  });
});

describe('the toggle', () => {
  it('always points at the other theme', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });

  it('says which way it goes, in plain English', () => {
    expect(switchThemeLabel('dark')).toBe('Switch to the dark theme');
    expect(switchThemeLabel('light')).toBe('Switch to the light theme');
  });
});

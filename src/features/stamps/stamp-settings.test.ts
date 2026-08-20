import { describe, expect, it } from 'vitest';
import { persistedSetting, type StorageLike } from '@renderer/lib/persisted-settings';
import { BATES_PREFIX_PLACEHOLDER, DEFAULT_BATES_FORM } from './bates-preview';
import { EXHIBIT_START } from './exhibit-form';
import {
  parseBatesMemory,
  parseExhibitMemory,
  type BatesMemory,
  type ExhibitMemory,
} from './stamp-settings';

function fakeStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const exhibitSetting = (storage: StorageLike) =>
  persistedSetting('exhibit-stamp', 1, parseExhibitMemory, storage);
const batesSetting = (storage: StorageLike) =>
  persistedSetting('bates-numbering', 1, parseBatesMemory, storage);

describe('remembering the exhibit settings', () => {
  const chosen: ExhibitMemory = {
    label: 'EXHIBIT F',
    position: 'bottom-center',
    fontSize: 65,
    margin: 24,
    bordered: true,
    slipSheetPosition: 'top-right',
    slipSheetFontSize: 48,
  };

  it('brings back the next label, placement, size, margin, and border', () => {
    const storage = fakeStorage();
    exhibitSetting(storage).write(chosen);
    expect(exhibitSetting(storage).read()).toEqual(chosen);
  });

  it('opens on the code defaults when nothing has been stored', () => {
    const start = EXHIBIT_START.form;
    expect(parseExhibitMemory(undefined)).toEqual({
      label: start.label,
      position: start.position,
      fontSize: start.fontSize,
      margin: start.margin,
      bordered: false,
      slipSheetPosition: 'center',
      slipSheetFontSize: 36,
    });
  });

  it('falls back to bordered OFF when the stored flag is unreadable', () => {
    expect(parseExhibitMemory({ bordered: 'yes' }).bordered).toBe(false);
    expect(parseExhibitMemory('not an object').bordered).toBe(false);
  });

  it('refuses a position, size, or label the panel could not show', () => {
    const memory = parseExhibitMemory({
      label: 'x'.repeat(200),
      position: 'middle-of-nowhere',
      fontSize: 5000,
      margin: -20,
      slipSheetPosition: 'sideways',
    });
    expect(memory).toEqual(parseExhibitMemory(undefined));
  });
});

describe('remembering the Bates settings', () => {
  const chosen: BatesMemory = {
    prefix: 'ASHFORD',
    startNumber: 4200,
    padWidth: 8,
    position: 'top-right',
    fontSize: 12,
    margin: 40,
    whiteBackingBox: true,
  };

  it('brings back the prefix, padding, corner, size, margin, and backing box', () => {
    const storage = fakeStorage();
    batesSetting(storage).write(chosen);
    expect(batesSetting(storage).read()).toEqual(chosen);
  });

  // The owner's call: the start number comes back exactly as it was left, and
  // the panel shows it as-is rather than guessing where the run got to.
  it('brings the start number back untouched', () => {
    const storage = fakeStorage();
    batesSetting(storage).write({ ...chosen, startNumber: 4200 });
    expect(batesSetting(storage).read().startNumber).toBe(4200);
  });

  it('keeps the prefix box empty on a first run, so the placeholder shows', () => {
    expect(parseBatesMemory(undefined).prefix).toBe('');
    expect(BATES_PREFIX_PLACEHOLDER).toBe('PLAINTIFF');
  });

  it('opens on the code defaults when nothing has been stored', () => {
    const start = DEFAULT_BATES_FORM;
    expect(parseBatesMemory(undefined)).toEqual({
      prefix: start.prefix,
      startNumber: start.startNumber,
      padWidth: start.padWidth,
      position: start.position,
      fontSize: start.fontSize,
      margin: start.margin,
      whiteBackingBox: start.whiteBackingBox,
    });
  });

  it('rejects a stored run that would produce a nonsense number', () => {
    const memory = parseBatesMemory({
      prefix: 'P'.repeat(100),
      startNumber: -5,
      padWidth: 99,
      position: 'bottom-middle',
      fontSize: 0,
    });
    expect(memory).toEqual(parseBatesMemory(undefined));
  });

  it('never stores a fractional start number or pad width', () => {
    const memory = parseBatesMemory({ startNumber: 12.7, padWidth: 6.9 });
    expect(memory.startNumber).toBe(12);
    expect(memory.padWidth).toBe(6);
  });
});

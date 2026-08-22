import { describe, expect, it } from 'vitest';
import { fieldNameCount, foldStorage, storageSeeds, widgetsOf } from './field-map';
import type { RawFieldObject } from './field-map';

/** Shapes verified against pdf.js getFieldObjects() on DISC-001 and MC-030. */
const FIELD_OBJECTS: Record<string, RawFieldObject[]> = {
  'DISC-001[0]': [{ id: '36R', type: '' }],
  'party.name': [{ id: '311R', type: 'text', value: '', editable: true }],
  'requests.definitions': [
    { id: '289R', type: 'checkbox', value: 'Off', exportValues: '1', editable: true },
  ],
  'party.role': [
    { id: '401R', type: 'radiobutton', value: 'plaintiff', exportValues: 'plaintiff' },
    { id: '402R', type: 'radiobutton', value: 'plaintiff', exportValues: 'defendant' },
  ],
  'court.county': [{ id: '410R', type: 'combobox', value: 'Alameda', editable: true }],
  'print.button': [{ id: '287R', type: 'button', value: 'Off', editable: true }],
  'locked.note': [{ id: '505R', type: 'text', value: 'fixed', editable: false }],
};

const widgets = widgetsOf(FIELD_OBJECTS);

describe('widgetsOf', () => {
  it('keeps only fillable widgets and drops buttons, roots, and read-only fields', () => {
    expect(widgets.map((widget) => widget.id).sort()).toEqual([
      '289R',
      '311R',
      '401R',
      '402R',
      '410R',
    ]);
  });

  it('normalises originals: checked-state booleans, everything else strings', () => {
    const byId = new Map(widgets.map((widget) => [widget.id, widget]));
    expect(byId.get('289R')?.original).toBe(false);
    expect(byId.get('401R')?.original).toBe(true);
    expect(byId.get('402R')?.original).toBe(false);
    expect(byId.get('410R')?.original).toBe('Alameda');
    expect(byId.get('311R')?.original).toBe('');
  });

  it('counts fields by name, not by widget', () => {
    expect(fieldNameCount(widgets)).toBe(4);
  });
});

describe('storageSeeds', () => {
  it('turns per-field edits into per-widget storage entries', () => {
    const seeds = storageSeeds(widgets, {
      'party.name': 'James L. Ashford',
      'requests.definitions': true,
      'party.role': 'defendant',
    });

    expect(new Map(seeds)).toEqual(
      new Map<string, { value: string | boolean }>([
        ['311R', { value: 'James L. Ashford' }],
        ['289R', { value: true }],
        ['401R', { value: false }],
        ['402R', { value: true }],
      ])
    );
  });
});

describe('foldStorage', () => {
  it('reads storage back into edits and drops values matching the bytes', () => {
    const storage = new Map<string, { value: unknown }>([
      ['311R', { value: 'James L. Ashford' }],
      ['289R', { value: true }],
      ['401R', { value: false }],
      ['402R', { value: true }],
      ['410R', { value: 'Alameda' }],
    ]);

    expect(foldStorage(widgets, (id) => storage.get(id))).toEqual({
      'party.name': 'James L. Ashford',
      'requests.definitions': true,
      'party.role': 'defendant',
    });
  });

  it('an answer typed and then reverted leaves no pending edit behind', () => {
    const storage = new Map<string, { value: unknown }>([
      ['311R', { value: '' }],
      ['289R', { value: false }],
      ['401R', { value: true }],
    ]);

    expect(foldStorage(widgets, (id) => storage.get(id))).toEqual({});
  });
});

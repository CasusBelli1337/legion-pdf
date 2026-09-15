import { describe, expect, it } from 'vitest';
import { isRailOp, RAIL_OPS } from './rail-actions';
import {
  countPhrase,
  pageCountLabel,
  railMenuEntries,
  selectedLabel,
  type RailMenuEntry,
} from './rail-menu';

const labelOf = (entries: RailMenuEntry[], id: string): string =>
  entries.find((entry) => entry.id === id)?.label ?? '(missing)';

describe('count copy', () => {
  it('names one page without a number and several with one', () => {
    expect(countPhrase(1)).toBe('this page');
    expect(countPhrase(3)).toBe('3 pages');
  });

  it('pluralises the rail header page count', () => {
    expect(pageCountLabel(1)).toBe('1 page');
    expect(pageCountLabel(65)).toBe('65 pages');
  });

  it('reads the selection back plainly', () => {
    expect(selectedLabel(2)).toBe('2 selected');
  });
});

describe('railMenuEntries', () => {
  it('offers Go to page only when a single page is selected', () => {
    const one = railMenuEntries({ page: 4, selected: [4], pageCount: 10, busy: false });
    expect(labelOf(one, 'go-to')).toBe('Go to page 4');

    const many = railMenuEntries({ page: 4, selected: [4, 5], pageCount: 10, busy: false });
    expect(many.some((entry) => entry.id === 'go-to')).toBe(false);
  });

  it('counts the selection in every action label', () => {
    const entries = railMenuEntries({ page: 2, selected: [2, 3], pageCount: 10, busy: false });
    expect(labelOf(entries, 'delete')).toBe('Delete 2 pages');
    expect(labelOf(entries, 'extract')).toBe('Extract 2 pages to a new PDF');
    expect(labelOf(entries, 'extract-remove')).toBe('Extract 2 pages and remove them');
    expect(labelOf(entries, 'rotate-cw')).toBe('Rotate 2 pages clockwise');
    expect(labelOf(entries, 'rotate-ccw')).toBe('Rotate 2 pages counter-clockwise');
  });

  it('says "this page" and "remove it" for a single page', () => {
    const entries = railMenuEntries({ page: 7, selected: [7], pageCount: 10, busy: false });
    expect(labelOf(entries, 'delete')).toBe('Delete this page');
    expect(labelOf(entries, 'extract-remove')).toBe('Extract this page and remove it');
  });

  it('disables every operation while one is already running', () => {
    const entries = railMenuEntries({ page: 1, selected: [1], pageCount: 10, busy: true });
    const running = entries.filter((entry) => entry.id !== 'go-to');
    expect(running.every((entry) => entry.disabled)).toBe(true);
  });

  it('disables Select all pages once everything is selected', () => {
    const entries = railMenuEntries({ page: 1, selected: [1, 2], pageCount: 2, busy: false });
    expect(labelOf(entries, 'select-all')).toBe('Select all pages');
    expect(entries.find((entry) => entry.id === 'select-all')?.disabled).toBe(true);
  });

  it('keeps the attorney-facing order: go to, delete, extract, rotate, select all', () => {
    const entries = railMenuEntries({ page: 1, selected: [1], pageCount: 10, busy: false });
    expect(entries.map((entry) => entry.id)).toEqual([
      'go-to',
      'delete',
      'extract',
      'extract-remove',
      'rotate-cw',
      'rotate-ccw',
      'select-all',
    ]);
  });

  // Drift guard: a menu item that changes the document with no operation behind
  // it would open, click, and quietly do nothing.
  it('has an operation behind every item that changes the document', () => {
    const entries = railMenuEntries({ page: 1, selected: [1], pageCount: 10, busy: false });
    const ops = entries.map((entry) => entry.id).filter(isRailOp);
    expect(ops.length).toBeGreaterThan(0);
    for (const action of ops) expect(typeof RAIL_OPS[action]).toBe('function');
  });

  it('labels each operation in the present tense for the busy line', () => {
    expect(RAIL_OPS.delete('doc', [1]).label).toBe('Removing pages');
    expect(RAIL_OPS['extract-remove']('doc', [1]).label).toBe('Moving pages to a new PDF');
  });
});

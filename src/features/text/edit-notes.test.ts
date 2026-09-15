import { describe, expect, it } from 'vitest';
import type { ReplaceTextDetail, TextEditBlock } from '@shared/types';
import { editReceipt, openingNote, planNote } from './edit-notes';

const BLOCK: TextEditBlock = {
  page: 3,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  lines: [],
  text: '',
  font: {
    documentFont: 'TimesNewRomanPSMT',
    sizePt: 12,
    colorHex: '#000000',
    bold: false,
    italic: false,
    designFamily: 'serif',
    reusable: true,
  },
  leadingPt: 14,
  alignment: 'left',
  angle: 0,
};

const KEPT: ReplaceTextDetail = {
  fontMode: 'document-font',
  missingCharacters: [],
  linesBefore: 2,
  linesAfter: 2,
  overflowed: false,
  glyphsRemoved: 10,
  glyphsAdded: 12,
  notes: [],
};

describe('openingNote', () => {
  it('names the document font when it can be reused', () => {
    expect(openingNote(BLOCK)).toEqual({
      kind: 'info',
      text: "Editing in the document's own font, TimesNewRomanPSMT 12 pt.",
    });
  });

  it('warns, and names the stand-in, when it cannot', () => {
    const note = openingNote({ ...BLOCK, font: { ...BLOCK.font, reusable: false } });
    expect(note.kind).toBe('warn');
    expect(note.text).toContain('cannot be reused');
    expect(note.text).toContain('Times 12 pt');
  });
});

describe('planNote', () => {
  it('names the characters that force a built-in face', () => {
    const note = planNote(BLOCK, {
      ...KEPT,
      fontMode: 'built-in-font',
      missingCharacters: ['é', 'Ж'],
      builtInFont: { family: 'times', bold: true },
    });
    expect(note.kind).toBe('warn');
    expect(note.text).toBe(
      'The document\'s font cannot type "é", "Ж", so this paragraph will be set in Times bold.'
    );
  });

  it("passes the engine's remarks through and falls back to the opening note", () => {
    expect(planNote(BLOCK, { ...KEPT, overflowed: true, notes: ['Runs 1 line longer.'] })).toEqual({
      kind: 'warn',
      text: 'Runs 1 line longer.',
    });
    expect(planNote(BLOCK, KEPT)).toEqual(openingNote(BLOCK));
  });
});

describe('editReceipt', () => {
  it('says where, in which font, and reminds about saving', () => {
    expect(editReceipt(BLOCK, KEPT)).toBe(
      "Replaced the paragraph on page 3 in the document's own font. Save the document to keep it."
    );
    expect(
      editReceipt(BLOCK, {
        ...KEPT,
        fontMode: 'built-in-font',
        missingCharacters: ['é'],
        builtInFont: { family: 'helvetica' },
        notes: ['Mixed fonts were merged.'],
      })
    ).toBe(
      'Replaced the paragraph on page 3 in Helvetica because the document\'s font cannot type "é". Mixed fonts were merged. Save the document to keep it.'
    );
  });
});

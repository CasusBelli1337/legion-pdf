/**
 * What the editor tells the attorney about an edit, in plain English: which
 * font the words will be set in, which characters forced a change of face,
 * and whether the new text runs longer than the old. Pure, so the sentences
 * are tested rather than trusted.
 */

import type { ReplaceTextDetail, TextEditBlock, TextFontChoice } from '@shared/types';
import { builtInChoiceFor } from '@shared/font-family-rules';
import { familyLabel } from './font-metrics';

export interface EditNote {
  kind: 'info' | 'warn' | 'error';
  text: string;
}

function quoted(characters: readonly string[]): string {
  return characters.map((character) => `"${character}"`).join(', ');
}

function standIn(block: TextEditBlock): TextFontChoice {
  return builtInChoiceFor(block.font.documentFont, block.font.designFamily);
}

/** The line shown as soon as a paragraph opens. */
export function openingNote(block: TextEditBlock): EditNote {
  const name = block.font.documentFont === '' ? 'an unnamed font' : block.font.documentFont;
  const size = `${Math.round(block.font.sizePt * 10) / 10} pt`;
  if (block.font.reusable) {
    return { kind: 'info', text: `Editing in the document's own font, ${name} ${size}.` };
  }
  return {
    kind: 'warn',
    text: `The document's font (${name}) cannot be reused, so this paragraph will be set in ${familyLabel(standIn(block))} ${size}.`,
  };
}

/** The line after a dry run of the text as typed so far. */
export function planNote(block: TextEditBlock, detail: ReplaceTextDetail): EditNote {
  const parts: string[] = [];
  if (detail.fontMode === 'built-in-font') {
    const face = familyLabel(detail.builtInFont ?? standIn(block));
    parts.push(
      detail.missingCharacters.length > 0
        ? `The document's font cannot type ${quoted(detail.missingCharacters)}, so this paragraph will be set in ${face}.`
        : `This paragraph will be set in ${face}.`
    );
  }
  parts.push(...detail.notes);
  if (parts.length === 0) return openingNote(block);
  return {
    kind: detail.fontMode === 'built-in-font' || detail.overflowed ? 'warn' : 'info',
    text: parts.join(' '),
  };
}

/** The footer receipt once the edit has landed. */
export function editReceipt(block: TextEditBlock, detail: ReplaceTextDetail): string {
  const where = `Replaced the paragraph on page ${block.page}`;
  const font =
    detail.fontMode === 'document-font'
      ? "in the document's own font"
      : `in ${familyLabel(detail.builtInFont ?? standIn(block))}` +
        (detail.missingCharacters.length > 0
          ? ` because the document's font cannot type ${quoted(detail.missingCharacters)}`
          : '');
  const notes = detail.notes.length > 0 ? ` ${detail.notes.join(' ')}` : '';
  return `${where} ${font}.${notes} Save the document to keep it.`;
}

/** What to say when a click lands on nothing editable. */
export const NOTHING_TO_EDIT =
  'There is no text at that spot. Click on a line of text to edit the paragraph it belongs to.';

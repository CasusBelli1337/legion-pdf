/**
 * From the model's ruled tables to the docx package's `Table`: fixed column
 * widths from the grid, exact row heights so the pleading grid holds, borders
 * only where the page drew them, and each cell's lines as paragraphs in the
 * cell. Owned by the tables lane; `build-docx.ts` calls it and nothing else.
 */

import type { Table } from 'docx';
import type { LayoutFont } from '@shared/types';
import type { ParagraphPlacement } from './docx-paragraph';
import type { TableParagraph } from './model';

type Fonts = Readonly<Record<string, LayoutFont>>;

export function docxTable(
  _paragraph: TableParagraph,
  _fonts: Fonts,
  _placement: ParagraphPlacement
): Table {
  throw new Error('NotImplemented: ruled tables are not written to Word yet.');
}

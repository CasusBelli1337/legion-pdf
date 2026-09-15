/**
 * core/export — a PDF's page layouts (shared/layout-model.ts) rebuilt as a
 * Word document: real paragraphs in the document's own fonts and sizes, its
 * margins, its headers and footers, its pictures, on its own page breaks.
 */

export { buildDocx, COLUMNS_NOTE } from './build-docx';
export type { DocxBuild, DocxBuildOptions } from './build-docx';
export { documentXmlOf, verifyDocx } from './verify';
export type { DocxExpectations } from './verify';
export { linesOf, lineText, isUnderlined } from './lines';
export { paragraphsOf, alignmentOf, medianLeading, startsBlock } from './paragraphs';
export { columnsOf, findGutter } from './columns';
export { pleadingOf, PLEADING_NOTE, LINE_NUMBERS_NOTE } from './pleading';
export type { Pleading } from './pleading';
export { planImages } from './images';
export { tabStopsOf, ruledTablesOf } from './tables';
export type { RuledTables } from './tables';
export { docxTable } from './docx-table';
export { docxImageParagraph } from './docx-image';
export { scanAppendixSections } from './scan-appendix';
export {
  groupSections,
  sectionGeometry,
  withVerticalMargins,
  bodyExtents,
  pageSizeOf,
} from './page-setup';
export type { SectionGeometry, Margins, ColumnLayout } from './page-setup';
export { pageParagraphs, settlePage, hasTabColumns } from './page-paragraphs';
export type { PageOptions, PageBuild } from './page-paragraphs';
export { runStyleFor, wordFontFor, readableFamily, halfPoints, hexColor } from './styles';
export type {
  Alignment,
  BodyFrame,
  Line,
  Paragraph,
  StyledRun,
  TableBorders,
  TableCell,
  TableParagraph,
  TextParagraph,
} from './model';

/**
 * core/export's front door: page layouts in, a verified .docx out.
 *
 * Every page becomes flowing paragraphs in its own section's frame; pages
 * after the first in a section start with a page break, so page 4 of the PDF
 * is page 4 of the Word file. The document's default font is the face most of
 * the text is set in, so nothing that slips past a run style lands in Calibri.
 */

import { Document, Packer, Paragraph as DocxParagraph } from 'docx';
import type { ISectionOptions, Table } from 'docx';
import type { ExportReceipt, LayoutFont, PageLayout, ScanPictureMode } from '@shared/types';
import { docxImageParagraph } from './docx-image';
import { PAGE_FIELD, docxTextParagraph } from './docx-paragraph';
import { STAMP_NOTE, footerFor, hasStamps, headerFor, sectionProperties } from './docx-section';
import { NUMBERED_LINES_NOTE, PLEADING_NOTE } from './pleading';
import { docxTable } from './docx-table';
import type { Paragraph, TextParagraph } from './model';
import { hasTabColumns, pageParagraphs, settlePage } from './page-paragraphs';
import { bodyRuns, groupSections, sectionGeometry, withVerticalMargins } from './page-setup';
import { scanAppendixSections } from './scan-appendix';
import { halfPoints, runStyleFor } from './styles';
import { verifyDocx } from './verify';

export interface DocxBuildOptions {
  title?: string;
  /** What becomes of a scanned page's picture; 'omit' when not given. */
  scanPictures?: ScanPictureMode;
}

export interface DocxBuild {
  bytes: Uint8Array;
  paragraphCount: number;
  pageCount: number;
  /** Plain English for the attorney about what could not be carried over. */
  notes: string[];
  /** The same, sorted into what was kept and what was left out. */
  receipt: ExportReceipt;
}

export const COLUMNS_NOTE =
  'Columns of text with no rules around them were set with tab stops, the way a typist sets them.';

type Fonts = Readonly<Record<string, LayoutFont>>;

interface Assembly {
  sections: ISectionOptions[];
  paragraphCount: number;
  samples: string[];
  notes: Set<string>;
}

/** The plain prefix of a text: letters, digits, simple punctuation, before any field. */
function plainPrefix(text: string): string {
  const beforeField = text.split(PAGE_FIELD)[0] ?? '';
  return beforeField.match(/^[A-Za-z0-9 .,;:()-]+/)?.[0]?.trim() ?? '';
}

/** Text the verification will look for: the first run of a paragraph, plain. */
function sampleOf(paragraph: Paragraph): string | null {
  if (paragraph.kind !== 'text') return null;
  const plain = plainPrefix(paragraph.lines[0]?.cells[0]?.runs[0]?.text ?? '');
  return plain.length >= 3 ? plain.slice(0, 40) : null;
}

function docxParagraphOf(
  paragraph: Paragraph,
  fonts: Fonts,
  pageBreakBefore: boolean
): DocxParagraph | Table {
  if (paragraph.kind === 'image') return docxImageParagraph(paragraph, { pageBreakBefore });
  if (paragraph.kind === 'table') return docxTable(paragraph, fonts, { pageBreakBefore });
  return docxTextParagraph(paragraph, fonts, { pageBreakBefore });
}

/** An empty line exactly as tall as the gap a paragraph could not carry itself. */
function spacerFor(paragraph: Paragraph): TextParagraph {
  const spacer: TextParagraph = {
    kind: 'text',
    lines: [],
    alignment: 'left',
    leadingPt: paragraph.spaceBeforePt,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLinePt: 0,
    spaceBeforePt: 0,
    tabStops: [],
    top: paragraph.top,
    spacer: true,
    ...(paragraph.columnBreakBefore === true ? { columnBreakBefore: true } : {}),
  };
  paragraph.spaceBeforePt = 0;
  delete paragraph.columnBreakBefore;
  return spacer;
}

/**
 * Word drops "space before" from the first paragraph after a page break (it
 * honours it at the top of a document and of a section — measured 2026-09-15),
 * and a table cannot carry space above it at all. Both open with an empty
 * line exactly that tall instead; the spacer carries the page break.
 */
function withSpacers(paragraphs: Paragraph[], afterBreak: boolean): Paragraph[] {
  return paragraphs.flatMap((paragraph, index) => {
    const needs = (index === 0 && afterBreak) || paragraph.kind === 'table';
    return needs && paragraph.spaceBeforePt > 0 ? [spacerFor(paragraph), paragraph] : [paragraph];
  });
}

function assembleSection(
  pages: PageLayout[],
  fonts: Fonts,
  assembly: Assembly,
  options: DocxBuildOptions
): void {
  const provisional = sectionGeometry(pages);
  const builds = pages.map((layout) =>
    pageParagraphs(layout, provisional, { scanPictures: options.scanPictures ?? 'omit' })
  );
  const geometry = withVerticalMargins(
    provisional,
    builds.filter((built) => built.columns.flat().length > 0).map((built) => built.box)
  );
  const topOfBody = geometry.size.height - geometry.margins.top;
  const children: (DocxParagraph | Table)[] = [];
  builds.forEach((built, index) => {
    built.notes.forEach((note) => assembly.notes.add(note));
    // An empty page still turns the paper: one empty paragraph carries the break.
    const settled = withSpacers(settlePage(built, topOfBody), index > 0);
    if (hasTabColumns(settled)) assembly.notes.add(COLUMNS_NOTE);
    const paragraphs = settled.length === 0 ? [null] : settled;
    paragraphs.forEach((paragraph, position) => {
      const pageBreakBefore = index > 0 && position === 0;
      if (paragraph === null) children.push(new DocxParagraph({ pageBreakBefore }));
      else children.push(docxParagraphOf(paragraph, fonts, pageBreakBefore));
      const sample = paragraph === null ? null : sampleOf(paragraph);
      if (sample !== null) assembly.samples.push(sample);
    });
    assembly.paragraphCount += paragraphs.length;
  });
  const { header, headerPt } = headerFor(pages, fonts, geometry);
  const { footer, footerPt } = footerFor(pages, fonts, geometry);
  assembly.sections.push({
    properties: sectionProperties(geometry, {
      ...(headerPt === undefined ? {} : { headerPt }),
      ...(footerPt === undefined ? {} : { footerPt }),
    }),
    ...(header === null ? {} : { headers: { default: header } }),
    ...(footer === null ? {} : { footers: { default: footer } }),
    children,
  });
}

/** The face and size most of the document's characters are set in. */
function dominantStyle(layouts: readonly PageLayout[], fonts: Fonts) {
  const byFont = new Map<string, number>();
  const bySize = new Map<number, number>();
  for (const layout of layouts) {
    for (const run of bodyRuns(layout)) {
      const font = fonts[run.fontKey];
      const name = font === undefined ? 'Times New Roman' : runStyleFor(font).wordFont;
      byFont.set(name, (byFont.get(name) ?? 0) + run.text.length);
      const size = halfPoints(run.sizePt);
      bySize.set(size, (bySize.get(size) ?? 0) + run.text.length);
    }
  }
  const top = <T>(counts: Map<T, number>, fallback: T): T =>
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
  return { font: top(byFont, 'Times New Roman'), size: top(bySize, 24) };
}

export async function buildDocx(
  layouts: readonly PageLayout[],
  options: DocxBuildOptions = {}
): Promise<DocxBuild> {
  if (layouts.length === 0) throw new Error('There are no pages to export.');
  const fonts: Fonts = Object.assign({}, ...layouts.map((layout) => layout.fonts));
  const assembly: Assembly = { sections: [], paragraphCount: 0, samples: [], notes: new Set() };
  for (const pages of groupSections(layouts)) assembleSection(pages, fonts, assembly, options);
  assembly.sections.push(...scanAppendixSections(layouts, options.scanPictures ?? 'omit'));
  if (hasStamps(layouts)) assembly.notes.add(STAMP_NOTE);
  const style = dominantStyle(layouts, fonts);
  const document = new Document({
    ...(options.title === undefined ? {} : { title: options.title }),
    creator: 'Legion PDF',
    styles: { default: { document: { run: { font: style.font, size: style.size } } } },
    sections: assembly.sections,
  });
  const bytes = new Uint8Array(await Packer.toBuffer(document));
  await verifyDocx(bytes, {
    paragraphCount: assembly.paragraphCount,
    samples: assembly.samples.slice(0, 200),
  });
  const notes = [...assembly.notes];
  return {
    bytes,
    paragraphCount: assembly.paragraphCount,
    pageCount: layouts.length,
    notes,
    receipt: receiptOf(notes),
  };
}

/** Notes that say what the file KEPT; every other note says what it had to leave out. */
const KEPT_NOTES: ReadonlySet<string> = new Set([PLEADING_NOTE, NUMBERED_LINES_NOTE, COLUMNS_NOTE]);

function receiptOf(notes: readonly string[]): ExportReceipt {
  return {
    kept: notes.filter((note) => KEPT_NOTES.has(note)),
    dropped: notes.filter((note) => !KEPT_NOTES.has(note)),
  };
}

/**
 * core/export's front door: page layouts in, a verified .docx out.
 *
 * Every page becomes flowing paragraphs in its own section's frame; pages
 * after the first in a section start with a page break, so page 4 of the PDF
 * is page 4 of the Word file. The document's default font is the face most of
 * the text is set in, so nothing that slips past a run style lands in Calibri.
 */

import { Paragraph as DocxParagraph } from 'docx';
import type { ISectionOptions, Table } from 'docx';
import type { ExportReceipt, LayoutFont, PageLayout, ScanPictureMode } from '@shared/types';
import { FOOTNOTES_NOTE, footnoteBook, footnoteNotes, takeFootnotes } from './docx-footnotes';
import type { FootnoteBook } from './docx-footnotes';
import { docxImageParagraph } from './docx-image';
import { packDocx } from './docx-pack';
import { PAGE_FIELD, docxTextParagraph } from './docx-paragraph';
import { STAMP_NOTE, hasStamps } from './docx-section';
import { NUMBERED_LINES_NOTE, PLEADING_NOTE } from './pleading';
import { docxTable } from './docx-table';
import type { Paragraph, TextParagraph } from './model';
import { opensNumbering } from './first-page-foot';
import { numberingRuns, withFootNumbers } from './page-numbering';
import { hasTabColumns, pageParagraphs, settlePage } from './page-paragraphs';
import { groupSections, sectionGeometry, withVerticalMargins } from './page-setup';
import {
  isPicturePagesNote,
  partsOf,
  picturePageSection,
  picturePagesNote,
  picturesToKeep,
} from './picture-pages';
import type { PagePicture } from './picture-pages';
import { pleadingPagesOf } from './pleading-pages';
import { scanAppendixSections } from './scan-appendix';
import { sectionBands } from './section-bands';
import { verifyDocx } from './verify';

export interface DocxBuildOptions {
  title?: string;
  /** What becomes of a scanned page's picture; 'omit' when not given. */
  scanPictures?: ScanPictureMode;
  /** Each page drawn whole, by page number; picture pages (picture-pages.ts) use theirs. */
  pagePictures?: ReadonlyMap<number, PagePicture>;
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
  footnotes: FootnoteBook;
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

/** Where Word ends the section's body, points above the paper's bottom edge (a negative margin is exact). */
function wordBottomOf(section: Pick<ISectionOptions, 'properties'>, fallback: number): number {
  const bottom = section.properties?.page?.margin?.bottom;
  return typeof bottom === 'number' ? Math.abs(bottom) / 20 : fallback;
}

interface SectionPage {
  build: ReturnType<typeof pageParagraphs>;
  layout: PageLayout;
}

/** Where a section's body starts and ends, points above the paper's bottom edge. */
interface BodyEdges {
  top: number;
  bottom: number;
}

/** One section's body: each page's paragraphs, a page break before every page but the first. */
function sectionChildren(
  pages: readonly SectionPage[],
  body: BodyEdges,
  fonts: Fonts,
  assembly: Assembly
): (DocxParagraph | Table)[] {
  const children: (DocxParagraph | Table)[] = [];
  pages.forEach(({ build: built, layout }, index) => {
    built.notes.forEach((note) => assembly.notes.add(note));
    takeFootnotes(assembly.footnotes, { build: built, layout }, fonts, body.bottom);
    // An empty page still turns the paper: one empty paragraph carries the break.
    const settled = withSpacers(settlePage(built, body.top), index > 0);
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
  return children;
}

/**
 * Pages on one paper share one frame, however their numbering runs: the body
 * is measured once over all of them, and each stretch of numbering
 * (page-numbering.ts) is a section of its own in that frame, with its own
 * head and foot.
 */
function assembleSections(
  sourcePages: PageLayout[],
  fonts: Fonts,
  assembly: Assembly,
  options: DocxBuildOptions
): void {
  const pages = pleadingPagesOf(sourcePages);
  const provisional = sectionGeometry(pages);
  const builds = pages.map((layout) =>
    pageParagraphs(layout, provisional, { scanPictures: options.scanPictures ?? 'omit' })
  );
  const geometry = withVerticalMargins(
    provisional,
    builds.filter((built) => built.columns.flat().length > 0).map((built) => built.box)
  );
  const topOfBody = geometry.size.height - geometry.margins.top;
  let done = 0;
  for (const run of numberingRuns(pages, opensNumbering)) {
    const own = run.flatMap((layout, index) => {
      const build = builds[done + index];
      return build === undefined ? [] : [{ build, layout }];
    });
    done += run.length;
    const bands = sectionBands(run, fonts, geometry);
    bands.notes.forEach((note) => assembly.notes.add(note));
    const body = { top: topOfBody, bottom: wordBottomOf(bands.section, geometry.margins.bottom) };
    assembly.sections.push({
      ...bands.section,
      children: sectionChildren(own, body, fonts, assembly),
    });
  }
}

export async function buildDocx(
  source: readonly PageLayout[],
  options: DocxBuildOptions = {}
): Promise<DocxBuild> {
  if (source.length === 0) throw new Error('There are no pages to export.');
  const layouts = withFootNumbers(source);
  const fonts: Fonts = Object.assign({}, ...layouts.map((layout) => layout.fonts));
  const assembly: Assembly = {
    sections: [],
    paragraphCount: 0,
    samples: [],
    notes: new Set(),
    footnotes: footnoteBook(),
  };
  const pictures = picturesToKeep(layouts, options.pagePictures);
  for (const part of partsOf(layouts, pictures)) {
    if (part.kind === 'picture') {
      assembly.sections.push(picturePageSection(part.layout, part.picture));
      assembly.paragraphCount += 1;
    } else {
      for (const pages of groupSections(part.layouts)) {
        assembleSections(pages, fonts, assembly, options);
      }
    }
  }
  if (pictures.size > 0) assembly.notes.add(picturePagesNote([...pictures.keys()]));
  const textPages = layouts.filter((layout) => !pictures.has(layout.page));
  assembly.sections.push(...scanAppendixSections(textPages, options.scanPictures ?? 'omit'));
  if (hasStamps(layouts)) assembly.notes.add(STAMP_NOTE);
  footnoteNotes(assembly.footnotes).forEach((note) => assembly.notes.add(note));
  const bytes = await packDocx(layouts, fonts, assembly, options.title);
  await verifyDocx(bytes, {
    paragraphCount: assembly.paragraphCount,
    samples: assembly.samples.slice(0, 200),
    footnotes: assembly.footnotes.notes.size,
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
const KEPT_NOTES: ReadonlySet<string> = new Set([
  PLEADING_NOTE,
  NUMBERED_LINES_NOTE,
  COLUMNS_NOTE,
  FOOTNOTES_NOTE,
]);

function isKept(note: string): boolean {
  return KEPT_NOTES.has(note) || isPicturePagesNote(note);
}

function receiptOf(notes: readonly string[]): ExportReceipt {
  return {
    kept: notes.filter(isKept),
    dropped: notes.filter((note) => !isKept(note)),
  };
}

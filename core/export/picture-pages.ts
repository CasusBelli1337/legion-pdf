/**
 * Picture pages: a scan stapled behind typed pages is an EXHIBIT, and it goes
 * into the Word file as one picture of the whole page, on a sheet of its own.
 *
 * Recognising such a page instead (what a scanned PLEADING gets, because the
 * attorney wants its words) turns a signed contract, a photograph, or a page
 * of pen strokes into fragments that Word re-wraps onto two or three sheets —
 * a 107-page declaration whose exhibits were scans came out as 180. A picture
 * is one page, exactly as served, and nobody edits the other side's exhibit.
 *
 * The rule reads only what is VISIBLE on the page, so it gives the same answer
 * before and after text recognition (recognised text is invisible):
 *
 *   - the document must have opened with typed pages — a scan before any typed
 *     page (a conformed first page) and a document that is scans throughout
 *     stay editable text;
 *   - after that, a page with no visible body words is a picture page, and so
 *     is a page under a full-page picture with only a few (a sticker, a label).
 *
 * A typed slip sheet ("EXHIBIT A") keeps its words and stays text. To get an
 * exhibit's words anyway, export its pages on their own: with no typed page
 * in front of them they are recognised like any other scan.
 */

import {
  Footer,
  Header,
  ImageRun,
  LineRuleType,
  PageOrientation,
  Paragraph as DocxParagraph,
} from 'docx';
import type { ISectionOptions } from 'docx';
import type { PageLayout } from '@shared/types';
import { pixels, twips } from './model';
import { pageSizeOf } from './page-setup';

/** One page drawn whole. JPEG keeps a hundred exhibit pages a sensible size. */
export interface PagePicture {
  data: Uint8Array;
  type: 'png' | 'jpg';
}

/** Visible body words that make a page a TYPED page the exhibits can follow. */
const TYPED_WORDS = 12;
/** Fewer visible words than this over a full-page picture are a label on a scan. */
const LABEL_WORDS = 12;
/** A picture covering this share of the page is the page (as in images.ts). */
const FULL_PAGE_SHARE = 0.6;
/** Taken off the picture's height so Word never needs a second sheet for it. */
const SHEET_SLACK_PT = 2;

const WORD = /[A-Za-z0-9]{2,}/;

function visibleBodyWords(layout: PageLayout): number {
  return layout.runs
    .filter((run) => run.role === 'body' && run.hidden !== true)
    .flatMap((run) => run.text.split(/\s+/))
    .filter((word) => WORD.test(word)).length;
}

function hasFullPagePicture(layout: PageLayout): boolean {
  const pageArea = layout.size.width * layout.size.height;
  return layout.images.some(
    (image) => pageArea > 0 && (image.rect.width * image.rect.height) / pageArea >= FULL_PAGE_SHARE
  );
}

function isPicturePage(layout: PageLayout): boolean {
  const words = visibleBodyWords(layout);
  return words === 0 || (words < LABEL_WORDS && hasFullPagePicture(layout));
}

/** The 1-based pages that should go in as pictures, in page order. */
export function picturePagesOf(layouts: readonly PageLayout[]): number[] {
  const firstTyped = layouts.findIndex((layout) => visibleBodyWords(layout) >= TYPED_WORDS);
  if (firstTyped < 0) return [];
  return layouts
    .slice(firstTyped + 1)
    .filter(isPicturePage)
    .map((layout) => layout.page);
}

/**
 * The picture pages that actually HAVE a picture. A page the rule picked but
 * nobody drew stays on the text path — never an empty sheet.
 */
export function picturesToKeep(
  layouts: readonly PageLayout[],
  supplied: ReadonlyMap<number, PagePicture> | undefined
): Map<number, PagePicture> {
  const kept = new Map<number, PagePicture>();
  for (const page of picturePagesOf(layouts)) {
    const picture = supplied?.get(page);
    if (picture !== undefined && picture.data.byteLength > 0) kept.set(page, picture);
  }
  return kept;
}

export type DocumentPart =
  | { kind: 'text'; layouts: PageLayout[] }
  | { kind: 'picture'; layout: PageLayout; picture: PagePicture };

/** The document in page order: runs of text pages, and picture pages one by one. */
export function partsOf(
  layouts: readonly PageLayout[],
  pictures: ReadonlyMap<number, PagePicture>
): DocumentPart[] {
  const parts: DocumentPart[] = [];
  for (const layout of layouts) {
    const picture = pictures.get(layout.page);
    const last = parts.at(-1);
    if (picture !== undefined) parts.push({ kind: 'picture', layout, picture });
    else if (last?.kind === 'text') last.layouts.push(layout);
    else parts.push({ kind: 'text', layouts: [layout] });
  }
  return parts;
}

/** A band a twentieth of a point tall: stated, so the previous section's is not inherited. */
function emptyBand(): DocxParagraph {
  return new DocxParagraph({
    spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
  });
}

/**
 * One sheet, the page's own paper, no margins, the picture edge to edge — a
 * section of its own so Word turns the page without a break paragraph, and so
 * a letter filing with a legal-size exhibit keeps both sizes.
 */
export function picturePageSection(layout: PageLayout, picture: PagePicture): ISectionOptions {
  const size = pageSizeOf(layout);
  const scale = (size.height - SHEET_SLACK_PT) / size.height;
  return {
    properties: {
      page: {
        size: {
          width: twips(Math.min(size.width, size.height)),
          height: twips(Math.max(size.width, size.height)),
          orientation:
            size.width > size.height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
      },
    },
    headers: { default: new Header({ children: [emptyBand()] }) },
    footers: { default: new Footer({ children: [emptyBand()] }) },
    children: [
      new DocxParagraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: picture.type,
            data: picture.data,
            transformation: {
              width: pixels(size.width * scale),
              height: pixels(size.height * scale),
            },
          }),
        ],
      }),
    ],
  };
}

/** "6, 8, 10–91": page numbers with runs folded, the way a cite lists them. */
export function pageRanges(pages: readonly number[]): string {
  const ranges: string[] = [];
  let start: number | null = null;
  let previous = 0;
  const close = (): void => {
    if (start !== null) ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
  };
  for (const page of [...pages].sort((a, b) => a - b)) {
    if (start !== null && page === previous + 1) previous = page;
    else {
      close();
      start = page;
      previous = page;
    }
  }
  close();
  return ranges.join(', ');
}

const NOTE_TAIL =
  'kept as a picture of the whole page, not as editable text. ' +
  'To get the words, export just those pages: on their own they are recognized as text.';

/** What the receipt says was kept as pictures. */
export function picturePagesNote(pages: readonly number[]): string {
  return pages.length === 1
    ? `Page ${pageRanges(pages)} is a scan or drawing attached behind typed pages (an exhibit): it was ${NOTE_TAIL}`
    : `Pages ${pageRanges(pages)} are scans or drawings attached behind typed pages (exhibits): each was ${NOTE_TAIL}`;
}

export function isPicturePagesNote(note: string): boolean {
  return note.endsWith(NOTE_TAIL);
}

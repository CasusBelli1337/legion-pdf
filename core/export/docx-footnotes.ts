/**
 * The document's footnotes on Word's side: the book that numbers them across
 * pages, the paragraphs each one holds, the style of Word's own mark, and the
 * separator above them.
 *
 * Word sets a page's footnotes hard against the bottom margin and takes their
 * height out of the body. The notes keep the exact line boxes the page gave
 * them, and the last one carries, as space after, whatever lay between it and
 * the margin — so every note sits where it sat. The separator is the one part
 * Word sizes by itself (a line of the default face), and a separator a hair
 * taller than the gap the page left pushes the body's last line, and its
 * footnote with it, onto the next page; it is set to an exact height that
 * fits the tightest page instead (`withFootnoteSeparator`).
 */

import JSZip from 'jszip';
import type { Paragraph as DocxParagraph } from 'docx';
import type { LayoutFont, PageLayout } from '@shared/types';
import { docxTextParagraph } from './docx-paragraph';
import { hasFootnotes, liftFootnotes } from './footnotes';
import type { Footnote } from './footnotes';
import { BASELINE_SHARE, twips } from './model';
import type { StyledRun } from './model';
import type { PageBuild } from './page-paragraphs';
import { median } from './paragraphs';
import { pageRanges } from './picture-pages';
import { halfPoints, runStyleFor } from './styles';

type Fonts = Readonly<Record<string, LayoutFont>>;

export const FOOTNOTES_NOTE =
  'Footnotes are real Word footnotes: each one stays with its reference mark as you edit.';

/** Room left between the body's last line and the separator, points: twip rounding never eats it. */
const SEPARATOR_SLACK = 1.5;
/** `SEPARATOR_ROOM` less the slack: every lifted page has room for this much. */
const SEPARATOR_MIN = 2;
/** Word's own separator on a twelve-point default: never taller than this. */
const SEPARATOR_MAX = 13.8;
/**
 * Word draws the separator's rule this far above the baseline of its
 * twelve-point line, and puts that baseline a fifth of the line's exact
 * height above the notes (measured in real Word, 2026-11-18: 3.1 pt at
 * heights of 5, 8 and 10.75 pt).
 */
const RULE_RISE = 3.1;

export interface FootnoteBook {
  /** The number the next footnote must carry. */
  next: number;
  /** A page's notes could not be lifted: Word's numbering would be wrong for any lifted after it. */
  stopped: boolean;
  notes: Map<number, DocxParagraph[]>;
  /** Pages whose footnotes stayed ordinary paragraphs. */
  keptPages: number[];
  /** The tightest gap any page left between its body and its notes. */
  gapPt: number;
  /** Each page's separator rule, points above its first note. */
  rises: number[];
  mark: StyledRun | null;
}

export function footnoteBook(): FootnoteBook {
  return {
    next: 1,
    stopped: false,
    notes: new Map(),
    keptPages: [],
    gapPt: Number.POSITIVE_INFINITY,
    rises: [],
    mark: null,
  };
}

function write(book: FootnoteBook, note: Footnote, fonts: Fonts): void {
  book.mark ??= note.mark;
  book.notes.set(
    note.id,
    note.paragraphs.map((paragraph) =>
      docxTextParagraph(paragraph, fonts, { pageBreakBefore: false })
    )
  );
}

/**
 * Lifts one page's footnotes into the book. `bodyBottom` is where Word ends
 * the page's body, PDF y — the edge the notes are set against.
 */
export function takeFootnotes(
  book: FootnoteBook,
  page: { build: PageBuild; layout: PageLayout },
  fonts: Fonts,
  bodyBottom: number
): void {
  const { build, layout } = page;
  if (book.stopped) {
    if (hasFootnotes(build, layout)) book.keptPages.push(layout.page);
    return;
  }
  const lift = liftFootnotes(build, layout, book.next);
  if (lift.kind === 'none') return;
  if (lift.kind === 'kept') {
    book.stopped = true;
    book.keptPages.push(layout.page);
    return;
  }
  const last = lift.notes.at(-1)?.paragraphs.at(-1);
  if (last !== undefined) last.spaceAfterPt = Math.max(0, lift.bottom - bodyBottom);
  lift.notes.forEach((note) => write(book, note, fonts));
  book.next += lift.notes.length;
  book.gapPt = Math.min(book.gapPt, lift.gapPt);
  book.rises.push(lift.risePt);
}

/** What the receipt says about the document's footnotes. */
export function footnoteNotes(book: FootnoteBook): string[] {
  const notes = book.notes.size > 0 ? [FOOTNOTES_NOTE] : [];
  if (book.keptPages.length === 0) return notes;
  const pages = pageRanges(book.keptPages);
  const where = book.keptPages.length === 1 ? `page ${pages}` : `pages ${pages}`;
  return [
    ...notes,
    `The footnotes on ${where} were left as ordinary text at the foot of the page: they could not be tied to their reference marks without changing how the page is laid out.`,
  ];
}

/** The `footnotes` and mark style the docx package's Document takes; empty when there are none. */
export function footnoteOptions(book: FootnoteBook, fonts: Fonts) {
  if (book.notes.size === 0 || book.mark === null) return {};
  const font = fonts[book.mark.fontKey];
  const run = {
    superScript: true,
    size: halfPoints(book.mark.sizePt),
    ...(font === undefined ? {} : { font: runStyleFor(font).wordFont }),
  };
  return {
    footnotes: Object.fromEntries(
      [...book.notes].map(([id, children]) => [id, { children }] as const)
    ),
    footnoteReference: { run },
  };
}

/**
 * The separator's exact height: the one that draws its rule where the pages
 * drew theirs, and never more than the tightest page has room for.
 */
export function separatorHeight(book: FootnoteBook): number {
  const rise = median(book.rises);
  const wanted = (rise - RULE_RISE) / (1 - BASELINE_SHARE);
  const room = Math.min(SEPARATOR_MAX, book.gapPt - SEPARATOR_SLACK);
  return Math.max(SEPARATOR_MIN, Math.min(wanted, room));
}

const SEPARATORS =
  /(<w:footnote w:type="(separator|continuationSeparator)"[^>]*>).*?<\/w:footnote>/gs;
/** Word only uses the file's separators when the settings name them; unnamed, it draws its own. */
const SEPARATOR_SETTINGS =
  '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>';

function separatorXml(open: string, kind: string, heightPt: number): string {
  const spacing = `<w:spacing w:before="0" w:after="0" w:line="${twips(heightPt)}" w:lineRule="exact"/>`;
  const size = '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  return `${open}<w:p><w:pPr>${spacing}</w:pPr><w:r>${size}<w:${kind}/></w:r></w:p></w:footnote>`;
}

async function partOf(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (entry === null)
    throw new Error(`The Word file is missing ${name} — refusing to hand it over.`);
  return entry.async('string');
}

/**
 * Sets the separator (and continuation separator) to an exact height and
 * names both in the settings. The docx package writes them as a single-spaced
 * line Word then ignores, and offers no way in, so the packed file's
 * footnotes and settings parts are rewritten.
 */
export async function withFootnoteSeparator(
  bytes: Uint8Array,
  heightPt: number
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const footnotes = await partOf(zip, 'word/footnotes.xml');
  let sized = 0;
  const rewritten = footnotes.replace(SEPARATORS, (_whole, open: string, kind: string) => {
    sized += 1;
    return separatorXml(open, kind, heightPt);
  });
  const settings = await partOf(zip, 'word/settings.xml');
  const anchor = settings.includes('<w:compat>') ? '<w:compat>' : '</w:settings>';
  if (sized !== 2 || !settings.includes(anchor)) {
    throw new Error('The footnote separator could not be sized — refusing to hand the file over.');
  }
  zip.file('word/footnotes.xml', rewritten);
  zip.file('word/settings.xml', settings.replace(anchor, `${SEPARATOR_SETTINGS}${anchor}`));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

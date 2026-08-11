/**
 * What survives the rebuild besides the pages: bookmarks and document
 * information.
 *
 * Both can quote the very text that was just destroyed — an outline entry
 * reading "Account 99887766" survives a perfect page rebuild and hands the
 * secret straight back. So everything carried across is filtered through the
 * marked strings first. The verification pass would catch a leak here anyway
 * (it scans the whole file), but catching it would mean refusing the document;
 * filtering means the attorney keeps their outline AND their redaction.
 */

import type { PDFDocument } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';

/** What a bookmark title becomes when it quotes destroyed text. */
export const REDACTED_TITLE = '[Redacted]';

function quotesAnything(value: string, needles: readonly string[]): boolean {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

/** Outline with any title quoting destroyed text replaced, structure intact. */
export function redactTitles(
  tree: readonly BookmarkNode[],
  needles: readonly string[]
): BookmarkNode[] {
  return tree.map((node) => ({
    title: quotesAnything(node.title, needles) ? REDACTED_TITLE : node.title,
    page: node.page,
    children: redactTitles(node.children, needles),
  }));
}

interface InfoField {
  name: string;
  read(document: PDFDocument): string | undefined;
  write(document: PDFDocument, value: string): void;
}

/** Config over code: one row per Info entry, so adding one is not a branch. */
const INFO_FIELDS: readonly InfoField[] = [
  { name: 'Title', read: (d) => d.getTitle(), write: (d, v) => d.setTitle(v) },
  { name: 'Author', read: (d) => d.getAuthor(), write: (d, v) => d.setAuthor(v) },
  { name: 'Subject', read: (d) => d.getSubject(), write: (d, v) => d.setSubject(v) },
  { name: 'Keywords', read: (d) => d.getKeywords(), write: (d, v) => d.setKeywords([v]) },
  { name: 'Creator', read: (d) => d.getCreator(), write: (d, v) => d.setCreator(v) },
  { name: 'Producer', read: (d) => d.getProducer(), write: (d, v) => d.setProducer(v) },
];

export interface CarriedMetadata {
  /** Field names copied to the rebuilt document. */
  copied: string[];
  /** Field names dropped because they quoted destroyed text. */
  dropped: string[];
}

/**
 * Copy the document information across, dropping any field that quotes a
 * destroyed string. XMP is deliberately NOT carried: it is a second copy of the
 * same metadata, and a redacted document is no place to reconstruct one.
 */
export function carryMetadata(
  source: PDFDocument,
  target: PDFDocument,
  needles: readonly string[]
): CarriedMetadata {
  const carried: CarriedMetadata = { copied: [], dropped: [] };
  for (const field of INFO_FIELDS) {
    const value = field.read(source);
    if (value === undefined || value.length === 0) continue;
    if (quotesAnything(value, needles)) {
      carried.dropped.push(field.name);
      continue;
    }
    field.write(target, value);
    carried.copied.push(field.name);
  }
  return carried;
}

/**
 * Outline (bookmark) WRITER. pdf-lib cannot write outlines, so this builds the
 * dictionary tree by hand: refs are reserved first (`nextRef`) so /Parent,
 * /Prev, and /Next can point at siblings that do not exist yet, then each node
 * is assigned. Replacing an outline also DELETES the old nodes from the file —
 * a stale bookmark title is leaked text, not harmless leftovers.
 */

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRef } from 'pdf-lib';
import type { PDFDocument, PDFObject } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';
import { assertPageInRange } from '../pdf-meta';

const MAX_DELETE_NODES = 20_000;

interface WrittenSiblings {
  first: PDFRef;
  last: PDFRef;
  /** Descendants of this level, all levels open — the /Count value. */
  count: number;
}

function collectOutlineRefs(document: PDFDocument, start: PDFObject | undefined): PDFRef[] {
  const found: PDFRef[] = [];
  const seen = new Set<string>();
  const queue: PDFObject[] = start === undefined ? [] : [start];
  while (queue.length > 0 && found.length < MAX_DELETE_NODES) {
    const next = queue.shift();
    if (!(next instanceof PDFRef) || seen.has(next.tag)) continue;
    seen.add(next.tag);
    found.push(next);
    const item = document.context.lookupMaybe(next, PDFDict);
    if (item === undefined) continue;
    for (const key of ['First', 'Next'] as const) {
      const child = item.get(PDFName.of(key));
      if (child !== undefined) queue.push(child);
    }
  }
  return found;
}

/** Drops the outline and every node object behind it. */
export function removeOutline(document: PDFDocument): void {
  const key = PDFName.of('Outlines');
  const rootRef = document.catalog.get(key);
  document.catalog.delete(key);
  if (!(rootRef instanceof PDFRef)) return;
  const root = document.context.lookupMaybe(rootRef, PDFDict);
  for (const ref of collectOutlineRefs(document, root?.get(PDFName.of('First')))) {
    document.context.delete(ref);
  }
  document.context.delete(rootRef);
}

function destinationFor(
  document: PDFDocument,
  page: number,
  pageRefs: readonly PDFRef[]
): PDFArray {
  const target = pageRefs[page - 1];
  if (target === undefined) {
    throw new RangeError(`Bookmark points at page ${page}, which this document does not have.`);
  }
  const destination = PDFArray.withContext(document.context);
  destination.push(target);
  // /XYZ with null coordinates: "top of the page, keep the reader's zoom".
  destination.push(PDFName.of('XYZ'));
  destination.push(PDFNull);
  destination.push(PDFNull);
  destination.push(PDFNull);
  return destination;
}

function writeItem(
  document: PDFDocument,
  entry: { node: BookmarkNode; ref: PDFRef },
  neighbours: { parent: PDFRef; previous?: PDFRef; next?: PDFRef },
  pageRefs: readonly PDFRef[]
): number {
  const item = PDFDict.withContext(document.context);
  item.set(PDFName.of('Title'), PDFHexString.fromText(entry.node.title));
  item.set(PDFName.of('Parent'), neighbours.parent);
  if (neighbours.previous !== undefined) item.set(PDFName.of('Prev'), neighbours.previous);
  if (neighbours.next !== undefined) item.set(PDFName.of('Next'), neighbours.next);
  item.set(PDFName.of('Dest'), destinationFor(document, entry.node.page, pageRefs));

  const children = writeSiblings(document, entry.node.children, entry.ref, pageRefs);
  if (children !== undefined) {
    item.set(PDFName.of('First'), children.first);
    item.set(PDFName.of('Last'), children.last);
    item.set(PDFName.of('Count'), PDFNumber.of(children.count));
  }
  document.context.assign(entry.ref, item);
  return 1 + (children?.count ?? 0);
}

function writeSiblings(
  document: PDFDocument,
  nodes: readonly BookmarkNode[],
  parent: PDFRef,
  pageRefs: readonly PDFRef[]
): WrittenSiblings | undefined {
  const entries = nodes.map((node) => ({ node, ref: document.context.nextRef() }));
  const first = entries.at(0);
  const last = entries.at(-1);
  if (first === undefined || last === undefined) return undefined;

  let count = 0;
  entries.forEach((entry, index) => {
    count += writeItem(
      document,
      entry,
      { parent, previous: entries[index - 1]?.ref, next: entries[index + 1]?.ref },
      pageRefs
    );
  });
  return { first: first.ref, last: last.ref, count };
}

function assertPagesExist(tree: readonly BookmarkNode[], pageCount: number): void {
  for (const node of tree) {
    assertPageInRange(node.page, pageCount, 'bookmark page');
    assertPagesExist(node.children, pageCount);
  }
}

/**
 * Replaces the document outline with `tree` and returns how many bookmarks were
 * written. An empty tree is a legitimate instruction — it removes them all.
 */
export function writeOutline(document: PDFDocument, tree: readonly BookmarkNode[]): number {
  assertPagesExist(tree, document.getPageCount());
  removeOutline(document);
  if (tree.length === 0) return 0;

  const pageRefs = document.getPages().map((page) => page.ref);
  const rootRef = document.context.nextRef();
  const written = writeSiblings(document, tree, rootRef, pageRefs);
  if (written === undefined) return 0;

  const root = PDFDict.withContext(document.context);
  root.set(PDFName.of('Type'), PDFName.of('Outlines'));
  root.set(PDFName.of('First'), written.first);
  root.set(PDFName.of('Last'), written.last);
  root.set(PDFName.of('Count'), PDFNumber.of(written.count));
  document.context.assign(rootRef, root);
  document.catalog.set(PDFName.of('Outlines'), rootRef);
  return written.count;
}

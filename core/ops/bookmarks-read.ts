/**
 * Outline (bookmark) READER. pdf-lib has no outline API at all, so this walks
 * the raw /Outlines dictionary tree: /First then /Next for siblings, /First for
 * children, and a destination that may be a direct array, a named destination,
 * or a GoTo action. Unresolvable destinations keep the title and fall back to
 * page 1 rather than dropping the bookmark.
 */

import { PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib';
import type { PDFDocument, PDFObject } from 'pdf-lib';
import type { BookmarkNode } from '@shared/types';

/** Cycle/runaway guard: a malformed outline must not hang the app. */
const MAX_NODES = 20_000;
const MAX_NAME_TREE_DEPTH = 32;

function asRef(object: PDFObject | undefined): PDFRef | undefined {
  return object instanceof PDFRef ? object : undefined;
}

/** page ref tag → 1-based page number, so a /Dest can name its page. */
function pageNumbersByRef(document: PDFDocument): Map<string, number> {
  const map = new Map<string, number>();
  document.getPages().forEach((page, index) => map.set(page.ref.tag, index + 1));
  return map;
}

function titleOf(item: PDFDict): string {
  const title = item.lookupMaybe(PDFName.of('Title'), PDFString, PDFHexString);
  const text = title?.decodeText().trim() ?? '';
  return text.length > 0 ? text : '(untitled bookmark)';
}

/** The /Names half of a name-tree node: [key, value, key, value, ...]. */
function scanNamePairs(names: PDFArray | undefined, name: string): PDFObject | undefined {
  for (let index = 0; names !== undefined && index + 1 < names.size(); index += 2) {
    const key = names.lookup(index);
    const keyText = key instanceof PDFString || key instanceof PDFHexString ? key.decodeText() : '';
    if (keyText === name) return names.lookup(index + 1);
  }
  return undefined;
}

/** Walks a /Names name tree (or a flat /Dests dict) for one destination name. */
function lookupNamedDestination(
  document: PDFDocument,
  name: string,
  node: PDFDict | undefined,
  depth: number
): PDFObject | undefined {
  if (node === undefined || depth > MAX_NAME_TREE_DEPTH) return undefined;
  const match = scanNamePairs(node.lookupMaybe(PDFName.of('Names'), PDFArray), name);
  if (match !== undefined) return match;

  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray);
  for (let index = 0; kids !== undefined && index < kids.size(); index += 1) {
    const found = lookupNamedDestination(
      document,
      name,
      kids.lookupMaybe(index, PDFDict),
      depth + 1
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

function namedDestination(document: PDFDocument, name: string): PDFObject | undefined {
  const catalog = document.catalog;
  const legacy = catalog.lookupMaybe(PDFName.of('Dests'), PDFDict)?.lookup(PDFName.of(name));
  if (legacy !== undefined) return legacy;
  const tree = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  return lookupNamedDestination(document, name, tree?.lookupMaybe(PDFName.of('Dests'), PDFDict), 0);
}

/** A destination is an array; a dict wraps it under /D; a name points at one. */
function destinationArray(
  document: PDFDocument,
  value: PDFObject | undefined
): PDFArray | undefined {
  const resolved = value instanceof PDFRef ? document.context.lookup(value) : value;
  if (resolved instanceof PDFArray) return resolved;
  if (resolved instanceof PDFDict) {
    return destinationArray(document, resolved.get(PDFName.of('D')));
  }
  if (resolved instanceof PDFName)
    return destinationArray(document, namedDestination(document, resolved.decodeText()));
  if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
    return destinationArray(document, namedDestination(document, resolved.decodeText()));
  }
  return undefined;
}

function destinationPage(document: PDFDocument, item: PDFDict, pages: Map<string, number>): number {
  const direct = destinationArray(document, item.get(PDFName.of('Dest')));
  const action = item.lookupMaybe(PDFName.of('A'), PDFDict);
  const array = direct ?? destinationArray(document, action?.get(PDFName.of('D')));
  const target = array !== undefined && array.size() > 0 ? array.get(0) : undefined;
  const page = target instanceof PDFRef ? pages.get(target.tag) : undefined;
  return page ?? 1;
}

function readSiblings(
  document: PDFDocument,
  first: PDFObject | undefined,
  pages: Map<string, number>,
  visited: Set<string>
): BookmarkNode[] {
  const nodes: BookmarkNode[] = [];
  let ref = asRef(first);
  while (ref !== undefined && !visited.has(ref.tag) && visited.size < MAX_NODES) {
    visited.add(ref.tag);
    const item = document.context.lookupMaybe(ref, PDFDict);
    if (item === undefined) break;
    nodes.push({
      title: titleOf(item),
      page: destinationPage(document, item, pages),
      children: readSiblings(document, item.get(PDFName.of('First')), pages, visited),
    });
    ref = asRef(item.get(PDFName.of('Next')));
  }
  return nodes;
}

/** The document's full outline tree, or an empty array when it has none. */
export function readOutline(document: PDFDocument): BookmarkNode[] {
  const root = document.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (root === undefined) return [];
  return readSiblings(
    document,
    root.get(PDFName.of('First')),
    pageNumbersByRef(document),
    new Set()
  );
}

/** Every node in a tree, depth-first — used for count checks and remapping. */
export function countBookmarks(tree: readonly BookmarkNode[]): number {
  return tree.reduce((total, node) => total + 1 + countBookmarks(node.children), 0);
}

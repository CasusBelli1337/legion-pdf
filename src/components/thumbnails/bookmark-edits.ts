/**
 * Pure edits over a bookmark tree. Nothing here talks to the app: a tree goes
 * in, a new tree comes out, and the caller hands the result to
 * `ops:bookmarksSet` in one round trip.
 *
 * A node is addressed by its PATH — the chain of sibling indexes down to it —
 * because a BookmarkNode carries no id of its own. Children ride along through
 * every edit: renaming keeps them, and removing a node LIFTS them into its
 * place rather than deleting a whole branch because one heading was wrong.
 */

import type { BookmarkNode } from '@shared/types';

/** Sibling indexes from the root down to one node, e.g. [0, 2] = third child of the first. */
export type BookmarkPath = readonly number[];

/** What a new bookmark is called before the attorney types anything. */
export function defaultBookmarkTitle(page: number): string {
  return `Page ${page}`;
}

export function samePath(left: BookmarkPath, right: BookmarkPath): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

/**
 * Replaces the node at `path` with whatever `edit` returns — zero nodes to
 * remove it, one to change it, its children to lift them a level.
 */
function editAt(
  tree: readonly BookmarkNode[],
  path: BookmarkPath,
  edit: (node: BookmarkNode) => BookmarkNode[]
): BookmarkNode[] {
  const [index, ...rest] = path;
  const node = index === undefined ? undefined : tree[index];
  // An unknown path changes nothing: never guess at which bookmark was meant.
  if (index === undefined || node === undefined) return [...tree];

  const replacement =
    rest.length === 0 ? edit(node) : [{ ...node, children: editAt(node.children, rest, edit) }];
  return [...tree.slice(0, index), ...replacement, ...tree.slice(index + 1)];
}

/**
 * Adds a bookmark at the end of the top level. Flat on purpose: an attorney
 * marking a 500-page exhibit set wants the heading recorded, not a nesting UI.
 */
export function appendBookmark(
  tree: readonly BookmarkNode[],
  title: string,
  page: number
): BookmarkNode[] {
  const clean = title.trim();
  return [
    ...tree,
    { title: clean.length > 0 ? clean : defaultBookmarkTitle(page), page, children: [] },
  ];
}

/** Retitles one bookmark. An empty title is a no-op, not a blank heading. */
export function renameBookmark(
  tree: readonly BookmarkNode[],
  path: BookmarkPath,
  title: string
): BookmarkNode[] {
  const clean = title.trim();
  if (clean.length === 0) return [...tree];
  return editAt(tree, path, (node) => [{ ...node, title: clean }]);
}

/** Removes one bookmark, keeping anything filed underneath it. */
export function removeBookmark(tree: readonly BookmarkNode[], path: BookmarkPath): BookmarkNode[] {
  return editAt(tree, path, (node) => [...node.children]);
}

/** The bookmark at a path, or undefined — used for the receipt and the prompt. */
export function bookmarkAt(
  tree: readonly BookmarkNode[],
  path: BookmarkPath
): BookmarkNode | undefined {
  const [index, ...rest] = path;
  const node = index === undefined ? undefined : tree[index];
  if (node === undefined) return undefined;
  return rest.length === 0 ? node : bookmarkAt(node.children, rest);
}

/** What the rail is doing right now: nothing, or one half-finished edit. */
export type BookmarkDraft =
  | { kind: 'idle' }
  | { kind: 'add'; title: string }
  | { kind: 'rename'; path: BookmarkPath; title: string }
  | { kind: 'remove'; path: BookmarkPath };

export const NO_DRAFT: BookmarkDraft = { kind: 'idle' };

/** The sentence the status footer shows after each edit lands. */
export const BOOKMARK_RECEIPTS = {
  added: (title: string, page: number) => `Added the bookmark "${title}" at page ${page}.`,
  renamed: (title: string) => `Renamed the bookmark to "${title}".`,
  removed: (title: string) => `Removed the bookmark "${title}".`,
} as const;

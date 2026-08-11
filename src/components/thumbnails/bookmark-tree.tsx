/**
 * The bookmarks tab of the rail. Click a heading and the viewer jumps to its
 * page; the pencil renames it, the bin removes it after a confirmation, and the
 * button underneath files the page on screen as a new bookmark.
 *
 * Every edit is the same round trip: a new tree is computed here and handed to
 * `ops:bookmarksSet`, then the rail re-reads it with `ops:bookmarksGet`.
 */

import { useState } from 'react';
import type { BookmarkNode } from '@shared/types';
import {
  BOOKMARK_RECEIPTS,
  NO_DRAFT,
  appendBookmark,
  bookmarkAt,
  defaultBookmarkTitle,
  removeBookmark,
  renameBookmark,
  samePath,
} from './bookmark-edits';
import type { BookmarkDraft, BookmarkPath } from './bookmark-edits';
import { BookmarkRow, InlineEdit } from './bookmark-row';
import type { BookmarkRowActions } from './bookmark-row';

interface BookmarkTreeProps {
  bookmarks: readonly BookmarkNode[];
  isLoading: boolean;
  /** The page the viewer is on — where "Add bookmark at this page" points. */
  currentPage: number;
  busy: boolean;
  error: string | null;
  onSelect(page: number): void;
  onCommit(tree: BookmarkNode[], receipt: string): void;
}

interface BranchProps {
  nodes: readonly BookmarkNode[];
  depth: number;
  path: BookmarkPath;
  draft: BookmarkDraft;
  actions: BookmarkRowActions;
}

function draftFor(draft: BookmarkDraft, path: BookmarkPath): BookmarkDraft {
  const at = draft.kind === 'rename' || draft.kind === 'remove' ? draft.path : undefined;
  return at !== undefined && samePath(at, path) ? draft : NO_DRAFT;
}

function BookmarkBranch({ nodes, depth, path, draft, actions }: BranchProps) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node, index) => {
        const here = [...path, index];
        return (
          <li key={`${node.title}-${node.page}-${index}`}>
            <BookmarkRow
              node={node}
              depth={depth}
              path={here}
              draft={draftFor(draft, here)}
              actions={actions}
            />
            {node.children.length > 0 && (
              <BookmarkBranch
                nodes={node.children}
                depth={depth + 1}
                path={here}
                draft={draft}
                actions={actions}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Pulse({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-3">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
      <span className="readout text-text-muted">{label}</span>
    </div>
  );
}

function AddControl({
  draft,
  currentPage,
  busy,
  onDraft,
  onAdd,
}: {
  draft: BookmarkDraft;
  currentPage: number;
  busy: boolean;
  onDraft(draft: BookmarkDraft): void;
  onAdd(title: string): void;
}) {
  if (draft.kind === 'add') {
    return (
      <InlineEdit
        value={draft.title}
        label="Name for the new bookmark"
        confirmLabel="Add"
        disabled={busy}
        onChange={(title) => onDraft({ kind: 'add', title })}
        onConfirm={() => onAdd(draft.title)}
        onCancel={() => onDraft(NO_DRAFT)}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onDraft({ kind: 'add', title: defaultBookmarkTitle(currentPage) })}
      className="m-2 rounded-md border border-armory-border-strong px-2 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-muted"
    >
      Add bookmark at this page
    </button>
  );
}

interface ActionInputs {
  bookmarks: readonly BookmarkNode[];
  busy: boolean;
  onSelect(page: number): void;
  setDraft(draft: BookmarkDraft): void;
  commit(tree: BookmarkNode[], receipt: string): void;
}

/** The three edits, each one tree in and one tree out. */
function buildActions({
  bookmarks,
  busy,
  onSelect,
  setDraft,
  commit,
}: ActionInputs): BookmarkRowActions {
  return {
    disabled: busy,
    onSelect,
    onDraft: setDraft,
    onRename: (path, title) => {
      const clean = title.trim();
      if (clean.length === 0) return;
      commit(renameBookmark(bookmarks, path, clean), BOOKMARK_RECEIPTS.renamed(clean));
    },
    onRemove: (path) => {
      const title = bookmarkAt(bookmarks, path)?.title ?? 'bookmark';
      commit(removeBookmark(bookmarks, path), BOOKMARK_RECEIPTS.removed(title));
    },
  };
}

export function BookmarkTree(props: BookmarkTreeProps) {
  const { bookmarks, currentPage, busy, error, onSelect, onCommit } = props;
  const [draft, setDraft] = useState<BookmarkDraft>(NO_DRAFT);

  const commit = (tree: BookmarkNode[], receipt: string): void => {
    setDraft(NO_DRAFT);
    onCommit(tree, receipt);
  };

  const add = (title: string): void => {
    const next = appendBookmark(bookmarks, title, currentPage);
    const added = next.at(-1);
    if (added !== undefined) commit(next, BOOKMARK_RECEIPTS.added(added.title, added.page));
  };

  if (props.isLoading) return <Pulse label="Reading bookmarks" />;
  const actions = buildActions({ bookmarks, busy, onSelect, setDraft, commit });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {bookmarks.length === 0 ? (
          <p className="p-3 text-xs text-text-muted">No bookmarks in this document.</p>
        ) : (
          <BookmarkBranch nodes={bookmarks} depth={0} path={[]} draft={draft} actions={actions} />
        )}
      </div>
      {busy && <Pulse label="Saving bookmarks" />}
      {error !== null && <p className="px-3 py-1 text-xs text-danger">{error}</p>}
      <div className="flex flex-col border-t border-armory-border">
        <AddControl
          draft={draft}
          currentPage={currentPage}
          busy={busy}
          onDraft={setDraft}
          onAdd={add}
        />
      </div>
    </div>
  );
}

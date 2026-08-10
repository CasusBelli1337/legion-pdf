/**
 * The bookmarks tab of the rail. A plain indented tree — click a heading and
 * the viewer jumps to its page.
 */

import type { BookmarkNode } from '@shared/types';

interface BookmarkTreeProps {
  bookmarks: readonly BookmarkNode[];
  isLoading: boolean;
  onSelect(page: number): void;
}

function BookmarkBranch({
  nodes,
  depth,
  onSelect,
}: {
  nodes: readonly BookmarkNode[];
  depth: number;
  onSelect(page: number): void;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node, index) => (
        <li key={`${node.title}-${node.page}-${index}`}>
          <button
            type="button"
            onClick={() => onSelect(node.page)}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            className="flex w-full items-baseline gap-2 py-1 pr-2 text-left text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary"
            title={`${node.title} - page ${node.page}`}
          >
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
            <span className="readout shrink-0 text-text-muted">{node.page}</span>
          </button>
          {node.children.length > 0 && (
            <BookmarkBranch nodes={node.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function BookmarkTree({ bookmarks, isLoading, onSelect }: BookmarkTreeProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />
        <span className="readout text-text-muted">Reading bookmarks</span>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return <p className="p-3 text-xs text-text-muted">No bookmarks in this document.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      <BookmarkBranch nodes={bookmarks} depth={0} onSelect={onSelect} />
    </div>
  );
}

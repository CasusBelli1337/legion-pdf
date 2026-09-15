/**
 * The strip above the thumbnails: how many pages the document has, and how many
 * of them are picked. A selection made two hundred rows ago is invisible on
 * screen, so the count — and a one-click way out of it — has to be readable
 * without scrolling.
 */

import { pageCountLabel, selectedLabel } from './rail-menu';

interface SelectionBarProps {
  pageCount: number;
  selectedCount: number;
  onClear(): void;
}

/**
 * It wraps rather than truncates. "500 pages" and "500 selected" do not both
 * fit at the rail's default width, and a clipped "500 s…" tells the attorney
 * nothing — a second 16-pixel line costs the thumbnails almost nothing.
 */
export function SelectionBar({ pageCount, selectedCount, onClear }: SelectionBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-armory-border px-2.5 py-1 text-xs">
      <span className="text-text-muted">{pageCountLabel(pageCount)}</span>
      {selectedCount > 0 && (
        <span className="ml-auto flex items-center gap-2">
          <span className="text-brand-500" data-selected-count={selectedCount}>
            {selectedLabel(selectedCount)}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="text-text-muted transition-colors duration-150 hover:text-text-primary"
          >
            Clear
          </button>
        </span>
      )}
    </div>
  );
}

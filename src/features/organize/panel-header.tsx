/** Page count, selection count, and the two selection shortcuts. */

interface PanelHeaderProps {
  pageCount: number;
  selectedCount: number;
  onSelectAll(): void;
  onClear(): void;
}

export function PanelHeader({ pageCount, selectedCount, onSelectAll, onClear }: PanelHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-armory-border px-3 py-2">
      <span className="text-xs text-text-secondary">
        {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        {selectedCount > 0 ? ` - ${selectedCount} selected` : ''}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="readout text-text-muted transition-colors duration-150 hover:text-text-primary"
        >
          All
        </button>
        <button
          type="button"
          onClick={onClear}
          className="readout text-text-muted transition-colors duration-150 hover:text-text-primary"
        >
          None
        </button>
      </div>
    </header>
  );
}

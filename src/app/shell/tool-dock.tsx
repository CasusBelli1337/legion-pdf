/**
 * The tool dock, on the LEFT where Acrobat keeps it: the icon rail against the
 * window edge, and the selected tool's panel beside it. It pushes the document
 * aside and never overlays it (UI golden rule 1).
 *
 * The panel's inner border is a splitter — Organize in particular is worth
 * widening, because the page previews grow with it.
 */

import { TOOL_PANELS, findToolPanel } from '../tool-registry';
import { useAppStore } from '../store';
import { DOCK_SIZE } from './panel-size';
import { ResizeHandle } from './resize-handle';
import { usePanelWidth } from './use-panel-width';

export function ToolDock() {
  const activeToolId = useAppStore((state) => state.activeToolId);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const active = findToolPanel(activeToolId);
  const ActivePanel = active?.panel ?? null;
  const dock = usePanelWidth(DOCK_SIZE, 'right');

  return (
    <div className="flex shrink-0 bg-armory-surface">
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-armory-border py-2">
        {TOOL_PANELS.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.id === activeToolId;
          return (
            <button
              key={tool.id}
              type="button"
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={isActive}
              onClick={() => setActiveTool(isActive ? null : tool.id)}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150 ${
                isActive
                  ? 'bg-armory-interactive text-brand-400'
                  : 'text-text-muted hover:bg-armory-interactive hover:text-text-primary'
              }`}
            >
              <Icon size={16} aria-hidden />
            </button>
          );
        })}
      </nav>
      {ActivePanel !== null && (
        <>
          <section
            className="flex min-w-0 flex-col overflow-y-auto"
            style={{ width: `${dock.width}px` }}
          >
            <div className="flex h-9 shrink-0 items-center border-b border-armory-border px-3">
              <span className="readout text-text-muted">{active?.title}</span>
            </div>
            <ActivePanel />
          </section>
          <ResizeHandle control={dock} label="Tool panel width" />
        </>
      )}
    </div>
  );
}

/**
 * Right dock. Renders whichever tool the registry selects — it pushes the
 * document aside and never overlays it (UI golden rule 1).
 */

import { TOOL_PANELS, findToolPanel } from '../tool-registry';
import { useAppStore } from '../store';

export function RightDock() {
  const activeToolId = useAppStore((state) => state.activeToolId);
  const setActiveTool = useAppStore((state) => state.setActiveTool);
  const active = findToolPanel(activeToolId);
  const ActivePanel = active?.panel ?? null;

  return (
    <div className="flex shrink-0 border-l border-armory-border bg-armory-surface">
      {ActivePanel !== null && (
        <section className="flex w-80 flex-col overflow-y-auto border-r border-armory-border">
          <div className="flex h-9 shrink-0 items-center border-b border-armory-border px-3">
            <span className="readout text-text-muted">{active?.title}</span>
          </div>
          <ActivePanel />
        </section>
      )}
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 py-2">
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
                  ? 'bg-armory-interactive text-purple-400'
                  : 'text-text-muted hover:bg-armory-interactive hover:text-text-primary'
              }`}
            >
              <Icon size={16} aria-hidden />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

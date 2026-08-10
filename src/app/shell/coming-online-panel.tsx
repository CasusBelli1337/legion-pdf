/**
 * The placeholder every tool panel shows until its feature lane lands.
 * Honest by design: it never pretends a tool is ready.
 */

interface ComingOnlinePanelProps {
  title: string;
  /** One plain-English sentence about what the tool will do. */
  summary: string;
  /** What ships with it, in the user's words. */
  capabilities: readonly string[];
}

export function ComingOnlinePanel({ title, summary, capabilities }: ComingOnlinePanelProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-status-maintenance" />
        <span className="readout text-text-muted">Coming online</span>
      </div>
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{summary}</p>
      <ul className="flex flex-col gap-1.5 border-t border-armory-border pt-3">
        {capabilities.map((capability) => (
          <li key={capability} className="text-xs text-text-muted">
            {capability}
          </li>
        ))}
      </ul>
    </div>
  );
}

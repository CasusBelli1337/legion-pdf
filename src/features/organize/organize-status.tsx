/**
 * The panel's bottom strip: what is running ("Page 12 of 65"), what just
 * happened, or what went wrong — in that order, and never more than one at a
 * time. The app must always look like it is doing something (UI golden rule 2).
 */

import type { ProgressEvent } from '@shared/types';

interface OrganizeStatusProps {
  busy: string | null;
  progress: ProgressEvent | null;
  notice: string | null;
  error: string | null;
  onDismiss(): void;
}

function progressLine(busy: string, progress: ProgressEvent | null): string {
  if (progress === null || progress.total <= 0) return `${busy}...`;
  return `${progress.phase} - page ${progress.current} of ${progress.total}`;
}

export function OrganizeStatus({ busy, progress, notice, error, onDismiss }: OrganizeStatusProps) {
  if (busy !== null) {
    const percent =
      progress !== null && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : null;
    return (
      <section className="flex flex-col gap-1.5 border-t border-armory-border p-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
          <span className="text-xs text-text-secondary">{progressLine(busy, progress)}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-armory-interactive">
          <div
            className="h-full bg-purple-600 transition-all duration-150"
            style={{ width: `${percent ?? 15}%` }}
          />
        </div>
      </section>
    );
  }

  if (error === null && notice === null) return null;

  return (
    <section className="flex items-start gap-2 border-t border-armory-border p-3">
      <p
        className={`flex-1 text-xs leading-relaxed ${error === null ? 'text-text-secondary' : 'text-danger'}`}
      >
        {error ?? notice}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="readout text-text-muted transition-colors duration-150 hover:text-text-primary"
      >
        OK
      </button>
    </section>
  );
}

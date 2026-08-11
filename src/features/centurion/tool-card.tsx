/**
 * The confirm card. Centurion never touches the document on its own: it
 * proposes, and this card is where the attorney says yes or no.
 *
 * The card leads with one plain-English sentence — "Stamp PLAINTIFF000001 to
 * PLAINTIFF000450 on all 450 pages, bottom right." — and keeps the settings
 * behind a details toggle, so the decision is made on a sentence rather than on
 * a block of JSON. Once answered it stays in the thread as the record of what
 * was done, with the receipt underneath.
 */

import { useEffect, useState } from 'react';
import { Bookmark, Droplets, EyeOff, Hash, ListOrdered, Stamp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IPC } from '@shared/ipc';
import type { CenturionToolName, ProgressEvent } from '@shared/types';
import type { CenturionCard } from './centurion-store';
import { RUNNING_LABEL, TOOL_TITLES, detailLines } from './tool-copy';

const TOOL_ICONS: Record<CenturionToolName, LucideIcon> = {
  applyBates: Hash,
  applyWatermark: Droplets,
  applyExhibitStamp: Stamp,
  applyPageNumbers: ListOrdered,
  setBookmarks: Bookmark,
  suggestRedactions: EyeOff,
};

/**
 * Live "Page 12 / 450" while main works, so the card is never a frozen spinner.
 * Subscribed only while the card is running, and the last event is dropped on
 * the way out rather than cleared in the effect — a setState there would cost a
 * second render for a value nobody sees.
 */
function useToolProgress(docId: string, active: boolean): ProgressEvent | null {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  useEffect(() => {
    if (!active) return;
    return window.librarius.onProgress(IPC.stamp.progress, (event) => {
      if (event.docId === docId) setProgress(event);
    });
  }, [active, docId]);
  return active ? progress : null;
}

function CardDetail({ card }: { card: CenturionCard }) {
  const lines = detailLines(card.name, card.input);
  return (
    <dl className="flex flex-col gap-1 rounded-md border border-armory-border bg-armory-base p-2">
      {lines.map((line) => (
        <div key={`${line.label}-${line.value}`} className="flex gap-2 text-xs">
          <dt className="shrink-0 text-text-muted">{line.label}</dt>
          <dd className="min-w-0 break-words text-text-secondary">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CardActions({ onDecide }: { onDecide(approved: boolean): void }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onDecide(true)}
        className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-150 hover:bg-purple-600"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => onDecide(false)}
        className="rounded-md border border-armory-border-strong px-3 py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-armory-interactive hover:text-text-primary"
      >
        Skip
      </button>
    </div>
  );
}

function RunningLine({ progress }: { progress: ProgressEvent | null }) {
  return (
    <div className="flex items-center justify-between gap-2" aria-live="polite">
      <span className="flex items-center gap-2 text-xs text-text-primary">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-purple-500" />
        {progress?.phase ?? RUNNING_LABEL}
      </span>
      {progress !== null && (
        <span className="readout text-text-secondary">
          Page {progress.current} / {progress.total}
        </span>
      )}
    </div>
  );
}

const RESULT_TONE: Record<string, string> = {
  done: 'bg-status-operational',
  skipped: 'bg-text-muted',
  failed: 'bg-danger',
};

function ResultLine({ card }: { card: CenturionCard }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${RESULT_TONE[card.status] ?? 'bg-text-muted'}`}
      />
      <p
        className={`text-xs leading-relaxed ${card.status === 'failed' ? 'text-danger' : 'text-text-secondary'}`}
      >
        {card.result}
      </p>
    </div>
  );
}

interface ToolCardProps {
  card: CenturionCard;
  docId: string;
  onDecide(approved: boolean): void;
}

export function ToolCard({ card, docId, onDecide }: ToolCardProps) {
  const [open, setOpen] = useState(false);
  const progress = useToolProgress(docId, card.status === 'running');
  const Icon = TOOL_ICONS[card.name];

  return (
    <section className="flex flex-col gap-2 rounded-md border border-armory-border-strong bg-armory-elevated p-3">
      <header className="flex items-center gap-2">
        <Icon size={14} className="text-purple-400" aria-hidden />
        <span className="readout text-text-muted">{TOOL_TITLES[card.name]}</span>
      </header>

      <p className="text-sm leading-relaxed text-text-primary">{card.summary}</p>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="self-start text-xs text-text-muted transition-colors duration-150 hover:text-text-primary"
      >
        {open ? 'Hide the details' : 'Show the details'}
      </button>
      {open && <CardDetail card={card} />}

      {card.status === 'pending' && <CardActions onDecide={onDecide} />}
      {card.status === 'running' && <RunningLine progress={progress} />}
      {card.result !== null && card.status !== 'running' && <ResultLine card={card} />}
    </section>
  );
}

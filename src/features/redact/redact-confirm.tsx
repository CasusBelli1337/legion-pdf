/**
 * The dialogs that stand between a redaction mark and destroyed content.
 *
 * Two of them, one visual family (and the same family as the signature flatten
 * confirmation, deliberately — an attorney should recognise "this is the point
 * of no return" on sight):
 *
 *   DestroyConfirm — the panel's "Redact and destroy" button.
 *   RedactSaveGate — saving a document that still carries marks.
 *
 * Every word on them comes from redact-messages.ts, where it is pinned by a
 * test. Nothing here decides anything: the answer is handed straight back.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ProgressEvent } from '@shared/types';
import {
  APPLY_NOW_LABEL,
  applyNowExplanation,
  DESTROY_CANCEL_NOTE,
  DESTROY_CONFIRM_LABEL,
  DESTROY_HEADING,
  destroyQuestion,
  pendingMarksHeading,
  REDACTION_GATE_CANCEL_NOTE,
  SAVE_AS_NOTICE,
  SAVE_WITHOUT_REDACTING_EXPLANATION,
  SAVE_WITHOUT_REDACTING_LABEL,
} from './redact-messages';
import type { RedactionGateChoice } from './redact-consent';
import { ActionButton, RunProgress } from './redact-panel-views';

interface ShellProps {
  label: string;
  children: ReactNode;
}

/**
 * The dialog itself takes focus, not a button. Autofocusing "Destroy and
 * redact" would let a stray Enter — the key that just ran a search in the panel
 * — destroy content nobody meant to destroy. Escape still cancels, Tab still
 * reaches the buttons in order, and the destructive one is nonetheless the
 * button the eye lands on.
 */
function Shell({ label, children }: ShellProps) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-armory-base/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        ref={card}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-armory-border-strong bg-armory-surface p-4 shadow-glow focus:outline-none"
      >
        {children}
      </div>
    </div>
  );
}

/** Escape always means "change nothing" — on both dialogs. */
function useEscape(onCancel: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);
}

function Heading({ text }: { text: string }) {
  return <h2 className="text-sm font-medium text-text-primary">{text}</h2>;
}

function Consequence({ text }: { text: string }) {
  return <p className="text-xs leading-relaxed text-danger">{text}</p>;
}

function Aside({ text }: { text: string }) {
  return <p className="text-xs leading-relaxed text-text-secondary">{text}</p>;
}

export interface DestroyConfirmProps {
  count: number;
  pages: number;
  onConfirm(): void;
  onCancel(): void;
}

export function DestroyConfirm({ count, pages, onConfirm, onCancel }: DestroyConfirmProps) {
  useEscape(onCancel);

  return (
    <Shell label={DESTROY_HEADING}>
      <Heading text={DESTROY_HEADING} />
      <Consequence text={destroyQuestion(count, pages)} />
      <Aside text={SAVE_AS_NOTICE} />
      <Aside text={DESTROY_CANCEL_NOTE} />
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-text-on-danger transition-[filter] duration-150 hover:brightness-110"
        >
          {DESTROY_CONFIRM_LABEL}
        </button>
        <ActionButton label="Cancel" variant="quiet" onClick={onCancel} />
      </div>
    </Shell>
  );
}

export interface RedactSaveGateProps {
  count: number;
  pages: number;
  onChoice(choice: RedactionGateChoice): void;
}

export function RedactSaveGate({ count, pages, onChoice }: RedactSaveGateProps) {
  useEscape(() => onChoice('cancel'));

  return (
    <Shell label={pendingMarksHeading(count)}>
      <Heading text={pendingMarksHeading(count)} />
      <Consequence text={applyNowExplanation(count, pages)} />
      <Aside text={SAVE_WITHOUT_REDACTING_EXPLANATION} />
      <Aside text={REDACTION_GATE_CANCEL_NOTE} />
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => onChoice('apply')}
          className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-text-on-danger transition-[filter] duration-150 hover:brightness-110"
        >
          {APPLY_NOW_LABEL}
        </button>
        <ActionButton
          label={SAVE_WITHOUT_REDACTING_LABEL}
          onClick={() => onChoice('save-anyway')}
        />
        <ActionButton label="Cancel" variant="quiet" onClick={() => onChoice('cancel')} />
      </div>
    </Shell>
  );
}

/**
 * The gate's dialog stays on screen while the content is destroyed, because the
 * redaction panel may not even be open when a save raises it — and a save that
 * looks frozen for a minute is how an attorney ends up killing the app mid-run
 * (UI golden rule: show movement).
 */
export function RedactWorking({ event }: { event: ProgressEvent | null }) {
  return (
    <Shell label="Destroying the marked content">
      <Heading text="Destroying the marked content" />
      <RunProgress event={event} />
      <Aside text="Nothing is saved until the check at the end proves the marked text is gone." />
    </Shell>
  );
}

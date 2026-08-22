/**
 * The Forms dock panel: says whether the open document is a fillable form,
 * how many answers are typed but not yet in the file, and offers to write
 * them now. Filling itself happens ON the page — click a field and type —
 * and answers are committed automatically by every save and print.
 */

import { useState } from 'react';
import { useActiveSession } from '@renderer/app/store';
import { useAppStore } from '@renderer/app/store';
import { useFormFieldCount, usePendingFormEditCount } from './form-store';
import { commitFormValuesFor } from './save-filling';

function Notice({ children }: { children: string }) {
  return <p className="text-sm leading-relaxed text-text-secondary">{children}</p>;
}

function StatusLine({ label, busy = false }: { label: string; busy?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${busy ? 'animate-pulse bg-brand-500' : 'bg-text-muted'}`}
      />
      <span className="readout text-text-muted">{label}</span>
    </div>
  );
}

function fieldSummary(count: number): string {
  const fields = count === 1 ? 'fillable field' : 'fillable fields';
  return `This document has ${count} ${fields}. Click any field on the page and type; use Tab to move to the next one.`;
}

function PendingSection({ docId, pending }: { docId: string; pending: number }) {
  const [writing, setWriting] = useState(false);
  const answers = pending === 1 ? 'answer is' : 'answers are';

  async function writeNow(): Promise<void> {
    setWriting(true);
    try {
      if (await commitFormValuesFor(docId)) {
        useAppStore.getState().setNotice('The form answers are now part of the document.');
      }
    } finally {
      setWriting(false);
    }
  }

  return (
    <>
      <StatusLine label={`${pending} unsaved ${pending === 1 ? 'answer' : 'answers'}`} busy />
      <Notice>
        {`${pending} ${answers} on the page but not in the file yet. Saving or printing writes them in automatically.`}
      </Notice>
      <button
        type="button"
        onClick={() => void writeNow()}
        disabled={writing}
        className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-text-on-brand transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-armory-interactive disabled:text-text-muted"
      >
        {writing ? 'Writing answers…' : 'Write answers into document'}
      </button>
    </>
  );
}

function DocumentSection({ docId }: { docId: string }) {
  const fieldCount = useFormFieldCount(docId);
  const pending = usePendingFormEditCount(docId);

  if (fieldCount === null) {
    return (
      <>
        <StatusLine label="Checking the document" busy />
        <Notice>Looking for fillable form fields.</Notice>
      </>
    );
  }
  if (fieldCount === 0) {
    return (
      <>
        <StatusLine label="No form fields" />
        <Notice>
          This document has no fillable form fields. Court forms that are only scans can still be
          filled with the Stamps &amp; Marks text tool.
        </Notice>
      </>
    );
  }
  return (
    <>
      {pending === 0 && <StatusLine label={`${fieldCount} fields, all saved`} />}
      <Notice>{fieldSummary(fieldCount)}</Notice>
      {pending > 0 && <PendingSection docId={docId} pending={pending} />}
    </>
  );
}

export function FormsPanel() {
  const session = useActiveSession();

  return (
    <div className="flex flex-col gap-4 p-4">
      {session === null ? (
        <>
          <StatusLine label="No document" />
          <Notice>Open a court form to fill it out.</Notice>
        </>
      ) : (
        <DocumentSection docId={session.id} />
      )}
    </div>
  );
}

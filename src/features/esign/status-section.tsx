/**
 * What happened after Send: every request that has gone out for this document,
 * who has signed, and who is still due. Pending envelopes are polled every 30
 * seconds while the panel is mounted, with a manual Refresh for the impatient;
 * a poll that fails keeps the last known status rather than blanking it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import type { EsignSignerStatus } from '@shared/types';
import { ActionButton, Section } from '@renderer/features/stamps';
import { useEsignStore, useSentRequests, type SentRequest } from './request-store';

const POLL_INTERVAL_MS = 30_000;

function pendingFor(docId: string): SentRequest[] {
  return useEsignStore
    .getState()
    .sent.filter(
      (entry) =>
        entry.docId === docId && (entry.status === null || entry.status.status === 'pending')
    );
}

function useEnvelopePolling(docId: string): { refresh(): Promise<void>; busy: boolean } {
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const pending = pendingFor(docId);
    if (pending.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        pending.map(async (entry) => {
          try {
            const status = await window.librarius.esign.status(entry.receipt.envelopeId);
            useEsignStore.getState().recordStatus(entry.receipt.envelopeId, status);
          } catch {
            // A poll that fails keeps the last known status; the next tick retries.
          }
        })
      );
    } finally {
      setBusy(false);
    }
  }, [docId]);

  useEffect(() => {
    // The first poll is scheduled, not called inline: an effect body must not
    // set state synchronously (react-hooks/set-state-in-effect).
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { refresh, busy };
}

/** Live statuses when the service has answered; everyone waiting until then. */
function signerRows(entry: SentRequest): EsignSignerStatus[] {
  return (
    entry.status?.signers ??
    entry.receipt.signers.map(({ name, email }) => ({ name, email, signedAt: null }))
  );
}

function SignerStatusRow({ status }: { status: EsignSignerStatus }) {
  const signed = status.signedAt !== null;
  return (
    <div className="flex items-center gap-2 text-xs">
      {signed ? (
        <Check size={12} className="shrink-0 text-status-operational" aria-hidden />
      ) : (
        <Clock size={12} className="shrink-0 text-text-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-text-primary">{status.name}</span>
      <span className="shrink-0 text-text-muted">
        {status.signedAt !== null
          ? `Signed ${new Date(status.signedAt).toLocaleDateString()}`
          : 'Waiting'}
      </span>
    </div>
  );
}

function SentRequestCard({ entry }: { entry: SentRequest }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-armory-border bg-armory-elevated p-2">
      <p className="truncate text-xs font-medium text-text-primary">{entry.receipt.title}</p>
      {signerRows(entry).map((status) => (
        <SignerStatusRow key={status.email} status={status} />
      ))}
      {entry.status?.status === 'complete' && (
        <p className="text-xs text-status-operational">Everyone signed — final copies emailed.</p>
      )}
    </div>
  );
}

export function StatusSection({ docId }: { docId: string }) {
  const sent = useSentRequests(docId);
  const { refresh, busy } = useEnvelopePolling(docId);
  if (sent.length === 0) return null;

  return (
    <Section title="Sent requests">
      {sent.map((entry) => (
        <SentRequestCard key={entry.receipt.envelopeId} entry={entry} />
      ))}
      <div className="flex items-center gap-2">
        <ActionButton
          label={busy ? 'Checking…' : 'Refresh'}
          variant="quiet"
          onClick={() => void refresh()}
          disabled={busy}
        />
        {busy && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden />}
      </div>
    </Section>
  );
}

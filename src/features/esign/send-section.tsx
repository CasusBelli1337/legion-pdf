/**
 * Sending the request: what it is called, the covering note, who does the
 * emailing, and the send itself. Validation speaks plain English and happens
 * before anything leaves the machine; the busy button is the movement rule.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  DocumentSession,
  EsignDelivery,
  EsignMailStatus,
  EsignReceipt,
  EsignSignerLink,
} from '@shared/types';
import {
  ActionButton,
  Field,
  Problem,
  Receipt,
  Section,
  TextField,
} from '@renderer/features/stamps';
import { BusyButton, INPUT_CLASS } from './esign-views';
import type { RequestField, RequestSigner } from './request-store';
import { sendRequest, type SendOutcome } from './send-actions';

interface Draft {
  title: string;
  message: string;
  requesterName: string;
  requesterEmail: string;
}

function defaultTitle(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '');
}

interface DraftFieldsProps {
  draft: Draft;
  onPatch(change: Partial<Draft>): void;
}

function DraftFields({ draft, onPatch }: DraftFieldsProps) {
  return (
    <>
      <TextField label="Title" value={draft.title} onChange={(title) => onPatch({ title })} />
      <Field label="Message to signers">
        <textarea
          value={draft.message}
          rows={3}
          placeholder="Please sign where indicated."
          onChange={(event) => onPatch({ message: event.target.value })}
          className={`${INPUT_CLASS} resize-y`}
        />
      </Field>
      <TextField
        label="Your name"
        value={draft.requesterName}
        onChange={(requesterName) => onPatch({ requesterName })}
      />
      <TextField
        label="Your email"
        value={draft.requesterEmail}
        onChange={(requesterEmail) => onPatch({ requesterEmail })}
      />
    </>
  );
}

interface DeliveryChoiceProps {
  delivery: EsignDelivery;
  mailReady: boolean;
  onChange(delivery: EsignDelivery): void;
}

function DeliveryChoice({ delivery, mailReady, onChange }: DeliveryChoiceProps) {
  const options: { value: EsignDelivery; label: string; disabled?: boolean; hint?: string }[] = [
    { value: 'service', label: 'Email links from Legion Sign (recommended)' },
    {
      value: 'gmail',
      label: 'Email from my Gmail',
      disabled: !mailReady,
      hint: mailReady ? undefined : 'Connect your Gmail under Settings below to use this.',
    },
    { value: 'links', label: "I'll share the links myself" },
  ];
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Who emails the signers">
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-start gap-2 ${option.disabled === true ? 'cursor-not-allowed opacity-60' : ''}`}
        >
          <input
            type="radio"
            name="esign-delivery"
            checked={delivery === option.value}
            disabled={option.disabled === true}
            onChange={() => onChange(option.value)}
            className="mt-0.5 accent-brand-600"
          />
          <span className="flex flex-col text-xs text-text-secondary">
            {option.label}
            {option.hint !== undefined && (
              <span className="text-xs text-text-muted">{option.hint}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Each signer's private link, for the attorney to pass along however they like. */
function SignerLinks({ links }: { links: readonly EsignSignerLink[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copy(link: EsignSignerLink): void {
    void navigator.clipboard.writeText(link.url).then(() => setCopiedId(link.id));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {links.map((link) => (
        <div
          key={link.id}
          className="flex items-center gap-2 rounded-md border border-armory-border bg-armory-elevated px-2 py-1.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-text-primary">{link.name}</p>
            <p className="truncate font-mono text-xs text-text-muted">{link.url}</p>
          </div>
          <ActionButton
            label={copiedId === link.id ? 'Copied' : 'Copy link'}
            variant="quiet"
            onClick={() => copy(link)}
          />
        </div>
      ))}
    </div>
  );
}

function noteFor(delivery: EsignDelivery, outcome: SendOutcome): string | null {
  if (!outcome.ok) return null;
  if (delivery === 'service') return 'Request sent — Legion Sign emailed each signer their link.';
  if (delivery === 'links') return "Request created — share each signer's link below.";
  if (outcome.emailError !== null) return null;
  const emails = outcome.emailedCount === 1 ? 'email' : 'emails';
  return `Request sent — ${outcome.emailedCount ?? 0} ${emails} went out from your Gmail.`;
}

interface SendRun {
  busy: boolean;
  error: string | null;
  note: string | null;
  links: EsignReceipt | null;
  send(docId: string, draft: Draft, delivery: EsignDelivery, request: RequestParts): Promise<void>;
}

interface RequestParts {
  signers: readonly RequestSigner[];
  fields: readonly RequestField[];
}

/** One send in flight at a time, and what the last one left behind. */
function useSendRun(): SendRun {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [links, setLinks] = useState<EsignReceipt | null>(null);

  async function send(
    docId: string,
    draft: Draft,
    delivery: EsignDelivery,
    request: RequestParts
  ): Promise<void> {
    setBusy(true);
    setError(null);
    setNote(null);
    setLinks(null);
    try {
      const outcome = await sendRequest(docId, {
        ...draft,
        delivery,
        signers: [...request.signers],
        fields: [...request.fields],
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setNote(noteFor(delivery, outcome));
      setError(outcome.emailError);
      if (delivery === 'links') setLinks(outcome.receipt);
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, note, links, send };
}

/** Fills the attorney's email from their connected Gmail, once, if untouched. */
function usePrefillEmail(
  mail: EsignMailStatus | null,
  setDraft: (update: (current: Draft) => Draft) => void
): void {
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || mail === null || !mail.configured) return;
    prefilled.current = true;
    setDraft((current) =>
      current.requesterEmail === '' ? { ...current, requesterEmail: mail.address } : current
    );
  }, [mail, setDraft]);
}

export interface SendSectionProps {
  session: DocumentSession;
  signers: readonly RequestSigner[];
  fields: readonly RequestField[];
  mail: EsignMailStatus | null;
}

export function SendSection({ session, signers, fields, mail }: SendSectionProps) {
  const [draft, setDraft] = useState<Draft>({
    title: defaultTitle(session.fileName),
    message: '',
    requesterName: '',
    requesterEmail: '',
  });
  const [delivery, setDelivery] = useState<EsignDelivery>('service');
  const run = useSendRun();
  usePrefillEmail(mail, setDraft);

  return (
    <Section title="Send request">
      <DraftFields draft={draft} onPatch={(change) => setDraft({ ...draft, ...change })} />
      <DeliveryChoice
        delivery={delivery}
        mailReady={mail?.configured === true}
        onChange={setDelivery}
      />
      <BusyButton
        label="Send for signature"
        busyLabel="Sending…"
        busy={run.busy}
        onClick={() => void run.send(session.id, draft, delivery, { signers, fields })}
      />
      {run.error !== null && <Problem message={run.error} />}
      {run.note !== null && <Receipt message={run.note} />}
      {run.links !== null && <SignerLinks links={run.links.signers} />}
    </Section>
  );
}

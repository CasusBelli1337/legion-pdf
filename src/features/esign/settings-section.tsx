/**
 * The two connections, collapsed out of the way: the Legion Sign service that
 * hosts the signing links, and the Armory Outreach sender request emails can
 * go out from (the attorney's own mailbox, over Tailscale). Secrets are
 * WRITE-ONLY — the app shows whether a key is stored, never the key; the
 * password boxes always start empty (rule 4 of the house rules).
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ActionButton, Field, Hint, Problem, TextField } from '@renderer/features/stamps';
// Direct import for the same reason send-actions gives: the barrel drags pdfjs.
import { describeError } from '@renderer/features/stamps/use-stamp-runner';
import { INPUT_CLASS } from './esign-views';
import type { EsignConfig } from './use-esign-config';

interface ConnectionFormProps {
  label: string;
  configured: boolean;
  publicLabel: string;
  /** The stored non-secret half (base URL, from address), prefilled. */
  publicValue: string;
  secretLabel: string;
  /** A second non-secret input (the Outreach from-mailbox). */
  extra?: { label: string; value: string };
  hint?: string;
  mono?: boolean;
  onSave(publicValue: string, secret: string, extraValue: string): Promise<void>;
  onClear(): Promise<void>;
}

function ConnectionHeader({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${configured ? 'bg-status-operational' : 'bg-text-muted'}`}
        aria-hidden
      />
      <span className="text-xs font-medium text-text-primary">{label}</span>
      <span className="text-xs text-text-muted">{configured ? 'Connected' : 'Not connected'}</span>
    </div>
  );
}

interface ConnectionRun {
  busy: 'save' | 'clear' | null;
  error: string | null;
  run(kind: 'save' | 'clear', action: () => Promise<void>): Promise<void>;
}

/** One save or clear in flight, and the plain-English reason it failed. */
function useConnectionRun(onSettled: () => void): ConnectionRun {
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'save' | 'clear', action: () => Promise<void>): Promise<void> {
    setBusy(kind);
    setError(null);
    try {
      await action();
      onSettled();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, run };
}

interface SaveClearRowProps {
  run: ConnectionRun;
  canSave: boolean;
  canClear: boolean;
  onSave(): Promise<void>;
  onClear(): Promise<void>;
}

function SaveClearRow({ run, canSave, canClear, onSave, onClear }: SaveClearRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionButton
        label={run.busy === 'save' ? 'Saving…' : 'Save'}
        onClick={() => void run.run('save', onSave)}
        disabled={run.busy !== null || !canSave}
      />
      <ActionButton
        label={run.busy === 'clear' ? 'Clearing…' : 'Clear'}
        variant="quiet"
        onClick={() => void run.run('clear', onClear)}
        disabled={run.busy !== null || !canClear}
      />
    </div>
  );
}

function ConnectionForm(props: ConnectionFormProps) {
  const { configured, publicValue, onSave, onClear } = props;
  const [address, setAddress] = useState(publicValue);
  const [extraValue, setExtraValue] = useState(props.extra?.value ?? '');
  const [secret, setSecret] = useState('');
  const run = useConnectionRun(() => setSecret(''));
  const extraMissing = props.extra !== undefined && extraValue.trim() === '';
  const canSave = secret !== '' && address.trim() !== '' && !extraMissing;

  return (
    <div className="flex flex-col gap-2">
      <ConnectionHeader label={props.label} configured={configured} />
      {props.hint !== undefined && <Hint>{props.hint}</Hint>}
      <TextField
        label={props.publicLabel}
        value={address}
        mono={props.mono}
        onChange={setAddress}
      />
      {props.extra !== undefined && (
        <TextField label={props.extra.label} value={extraValue} onChange={setExtraValue} />
      )}
      <Field label={props.secretLabel}>
        <input
          type="password"
          value={secret}
          autoComplete="off"
          placeholder={configured ? 'Stored — type a new one to replace it' : ''}
          onChange={(event) => setSecret(event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
      <SaveClearRow
        run={run}
        canSave={canSave}
        canClear={configured}
        onSave={() => onSave(address.trim(), secret, extraValue.trim())}
        onClear={onClear}
      />
      {run.error !== null && <Problem message={run.error} />}
    </div>
  );
}

/* Both forms are keyed on the stored value: when the status read (or a save)
   changes it, the form remounts and adopts it as its new starting point. */

function ServiceForm({ config }: { config: EsignConfig }) {
  const stored = config.service?.baseUrl ?? '';
  return (
    <ConnectionForm
      key={`service-${stored}`}
      label="Legion Sign service"
      configured={config.service?.configured === true}
      publicLabel="Service address"
      publicValue={stored}
      secretLabel="API key"
      mono
      onSave={config.saveService}
      onClear={config.clearService}
    />
  );
}

function OutreachForm({ config }: { config: EsignConfig }) {
  const storedUrl = config.mail?.baseUrl ?? '';
  const storedFrom = config.mail?.from ?? '';
  return (
    <ConnectionForm
      key={`mail-${storedUrl}-${storedFrom}`}
      label="Outreach sender"
      configured={config.mail?.configured === true}
      publicLabel="Armory address"
      publicValue={storedUrl}
      extra={{ label: 'From mailbox', value: storedFrom }}
      secretLabel="Armory service token"
      mono
      hint="Sends request emails from your own mailbox through the Armory's Outreach module, over your private Tailscale network. Tailscale must be running on this computer."
      onSave={(baseUrl, token, from) => config.saveMail(baseUrl, token, from)}
      onClear={config.clearMail}
    />
  );
}

export function SettingsSection({ config }: { config: EsignConfig }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3 border-b border-armory-border p-3 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-left text-text-muted"
      >
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <span className="readout">Settings</span>
      </button>
      {open && (
        <>
          <ServiceForm config={config} />
          <div className="border-t border-armory-border" />
          <OutreachForm config={config} />
        </>
      )}
    </section>
  );
}

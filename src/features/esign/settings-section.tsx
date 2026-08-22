/**
 * The two connections, collapsed out of the way: the Legion Sign service that
 * hosts the signing links, and the Gmail address request emails can go out
 * from. Secrets are WRITE-ONLY — the app shows whether a key is stored, never
 * the key; the password boxes always start empty (rule 4 of the house rules).
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
  /** The stored non-secret half (base URL, Gmail address), prefilled. */
  publicValue: string;
  secretLabel: string;
  hint?: string;
  mono?: boolean;
  onSave(publicValue: string, secret: string): Promise<void>;
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

function ConnectionForm(props: ConnectionFormProps) {
  const { configured, publicValue, onSave, onClear } = props;
  const [address, setAddress] = useState(publicValue);
  const [secret, setSecret] = useState('');
  const { busy, error, run } = useConnectionRun(() => setSecret(''));

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
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          label={busy === 'save' ? 'Saving…' : 'Save'}
          onClick={() => void run('save', () => onSave(address.trim(), secret))}
          disabled={busy !== null || secret === '' || address.trim() === ''}
        />
        <ActionButton
          label={busy === 'clear' ? 'Clearing…' : 'Clear'}
          variant="quiet"
          onClick={() => void run('clear', onClear)}
          disabled={busy !== null || !configured}
        />
      </div>
      {error !== null && <Problem message={error} />}
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

function MailForm({ config }: { config: EsignConfig }) {
  const stored = config.mail?.address ?? '';
  return (
    <ConnectionForm
      key={`mail-${stored}`}
      label="Gmail sender"
      configured={config.mail?.configured === true}
      publicLabel="Gmail address"
      publicValue={stored}
      secretLabel="App password"
      hint="Create an app password at myaccount.google.com/apppasswords — your normal Gmail password will not work here."
      onSave={config.saveMail}
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
          <MailForm config={config} />
        </>
      )}
    </section>
  );
}

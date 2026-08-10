/**
 * The no-key state. This is the only place an API key is ever typed, and the
 * value goes straight to the main process: it is never put in the store, in a
 * log, or anywhere the renderer keeps state after this component unmounts.
 */

import { useState } from 'react';
import { saveKey } from './centurion-actions';

const INPUT_CLASS =
  'rounded-md border border-armory-border bg-armory-base px-2 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-armory-focus focus:outline-none';

const BUTTON_CLASS =
  'rounded-md bg-purple-700 px-3 py-1.5 text-sm font-medium text-text-primary transition-colors duration-150 hover:bg-purple-600 disabled:bg-armory-interactive disabled:text-text-muted';

function KeyForm(props: {
  value: string;
  saving: boolean;
  onChange(value: string): void;
  onSubmit(): void;
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <label className="readout text-text-muted" htmlFor="centurion-key">
        API key
      </label>
      <input
        id="centurion-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-ant-..."
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={INPUT_CLASS}
      />
      <button
        type="submit"
        disabled={props.value.trim() === '' || props.saving}
        className={BUTTON_CLASS}
      >
        {props.saving ? 'Saving...' : 'Save key'}
      </button>
    </form>
  );
}

export function KeySetup() {
  const [key, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (key.trim() === '' || saving) return;
    setSaving(true);
    setError(null);
    const failure = await saveKey(key);
    setSaving(false);
    if (failure === null) setKeyValue('');
    else setError(failure);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold text-text-primary">Add your Anthropic key</h2>
      <p className="text-sm leading-relaxed text-text-secondary">
        Centurion reads the document you have open and answers questions about it. It needs your own
        Anthropic API key to do that.
      </p>
      <KeyForm value={key} saving={saving} onChange={setKeyValue} onSubmit={() => void submit()} />
      {error !== null && <p className="text-xs leading-relaxed text-danger">{error}</p>}
      <p className="border-t border-armory-border pt-3 text-xs leading-relaxed text-text-muted">
        The key is encrypted by Windows and stored on this computer only. It is never written into a
        file you can read, never sent anywhere except Anthropic, and never shown again once saved.
      </p>
    </div>
  );
}

/**
 * Who is signing. Adding takes a name and an email; removing a signer also
 * removes every box that was theirs (the store enforces the cascade, so a
 * stray field can never go out addressed to nobody).
 */

import { useState } from 'react';
import { ActionButton, Hint, Section, TextField } from '@renderer/features/stamps';
import { TrashButton } from './esign-views';
import { useEsignStore, type RequestSigner } from './request-store';
import { isValidEmail } from './send-actions';
import { accentAt } from './signer-colors';

function AddSignerRow({ docId }: { docId: string }) {
  const addSigner = useEsignStore((state) => state.addSigner);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const ready = name.trim() !== '' && isValidEmail(email);

  function add(): void {
    if (!ready) return;
    addSigner(docId, name.trim(), email.trim());
    setName('');
    setEmail('');
  }

  return (
    <div className="flex flex-col gap-2">
      <TextField label="Name" value={name} placeholder="Pat Morgan" onChange={setName} />
      <TextField label="Email" value={email} placeholder="pat@example.com" onChange={setEmail} />
      <ActionButton label="Add signer" variant="quiet" onClick={add} disabled={!ready} />
    </div>
  );
}

function SignerRow({ signer, index }: { signer: RequestSigner; index: number }) {
  const removeSigner = useEsignStore((state) => state.removeSigner);
  return (
    <div className="flex items-center gap-2 rounded-md border border-armory-border bg-armory-elevated px-2 py-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentAt(index).dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-text-primary">{signer.name}</p>
        <p className="truncate text-xs text-text-muted">{signer.email}</p>
      </div>
      <TrashButton
        label={`Remove ${signer.name} and their fields`}
        onClick={() => removeSigner(signer.id)}
      />
    </div>
  );
}

export function SignerSection({
  docId,
  signers,
}: {
  docId: string;
  signers: readonly RequestSigner[];
}) {
  return (
    <Section title="Signers">
      {signers.length === 0 && <Hint>Add each person who needs to sign this document.</Hint>}
      {signers.map((signer, index) => (
        <SignerRow key={signer.id} signer={signer} index={index} />
      ))}
      <AddSignerRow docId={docId} />
    </Section>
  );
}

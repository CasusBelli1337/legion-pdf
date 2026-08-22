/**
 * E-Sign — the dock panel: assemble a signature request (who signs, which
 * boxes are theirs), send it out for hosted signing, watch who has signed,
 * and export a fillable copy for Acrobat holdouts.
 *
 * The body is keyed by document id so switching tabs starts the FORM clean;
 * the request itself lives in the store and survives tool and tab switches.
 */

import { useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { useActiveSession } from '@renderer/app/store';
import { useViewerApi } from '@renderer/components/viewer';
import { EmptyPanel } from '@renderer/features/stamps';
import { ExportSection } from './export-section';
import { FieldListSection } from './field-list';
import { PlaceFieldsSection } from './place-fields';
import { useEsignFields, useEsignSigners, useEsignStore } from './request-store';
import { SendSection } from './send-section';
import { SettingsSection } from './settings-section';
import { SignerSection } from './signer-list';
import { StatusSection } from './status-section';
import { useEsignConfig } from './use-esign-config';
import { useEsignOverlay } from './use-esign-overlay';

function EsignBody({ session }: { session: DocumentSession }) {
  const api = useViewerApi();
  const signers = useEsignSigners(session.id);
  const fields = useEsignFields(session.id);
  const selectedId = useEsignStore((state) => state.selectedFieldId);
  const [chosenSignerId, setChosenSignerId] = useState<string | null>(null);
  const config = useEsignConfig();

  // The chip the attorney picked, as long as that signer still exists —
  // otherwise the first signer, so placement always has an owner.
  const activeSignerId = signers.some((signer) => signer.id === chosenSignerId)
    ? chosenSignerId
    : (signers[0]?.id ?? null);

  useEsignOverlay(api, session.id, signers, fields, selectedId, activeSignerId);

  return (
    <div className="flex flex-col">
      <SignerSection docId={session.id} signers={signers} />
      <PlaceFieldsSection
        signers={signers}
        activeSignerId={activeSignerId}
        onChoose={setChosenSignerId}
      />
      <FieldListSection signers={signers} fields={fields} selectedId={selectedId} />
      <SendSection session={session} signers={signers} fields={fields} mail={config.mail} />
      <StatusSection docId={session.id} />
      <ExportSection docId={session.id} signers={signers} fields={fields} />
      <SettingsSection config={config} />
    </div>
  );
}

export function EsignPanel() {
  const session = useActiveSession();
  if (session === null) {
    return (
      <EmptyPanel
        title="No document open."
        summary="Open a PDF to send it out for electronic signatures."
      />
    );
  }
  return <EsignBody key={session.id} session={session} />;
}

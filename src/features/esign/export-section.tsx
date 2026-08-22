/**
 * The Acrobat fallback: write a COPY of the document with real AcroForm fields
 * for the placed boxes, for signers who would rather Fill & Sign in their own
 * viewer and email the result back. Cancelling the save dialog is not an
 * error — the bridge answers null and nothing is said.
 */

import { useState } from 'react';
import { Hint, Problem, Receipt, Section } from '@renderer/features/stamps';
// Direct import for the same reason send-actions gives: the barrel drags pdfjs.
import { describeError } from '@renderer/features/stamps/use-stamp-runner';
import { BusyButton } from './esign-views';
import type { RequestField, RequestSigner } from './request-store';
import { plainFields, plainSigners } from './send-actions';

export interface ExportSectionProps {
  docId: string;
  signers: readonly RequestSigner[];
  fields: readonly RequestField[];
}

export function ExportSection({ docId, signers, fields }: ExportSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  async function exportCopy(): Promise<void> {
    setBusy(true);
    setError(null);
    setSavedPath(null);
    try {
      const result = await window.librarius.esign.exportFillable(docId, {
        signers: plainSigners(signers),
        fields: plainFields(fields),
      });
      if (result !== null) setSavedPath(result.filePath);
    } catch (caught) {
      setError(`The fillable copy could not be written: ${describeError(caught)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Export for Acrobat">
      <Hint>
        For signers who prefer Acrobat: real form fields plus marked signature boxes; they sign with
        Fill &amp; Sign and email it back.
      </Hint>
      <BusyButton
        label="Export fillable PDF"
        busyLabel="Writing…"
        busy={busy}
        disabled={fields.length === 0}
        onClick={() => void exportCopy()}
      />
      {fields.length === 0 && <Hint>Place at least one field first.</Hint>}
      {error !== null && <Problem message={error} />}
      {savedPath !== null && <Receipt message={`Fillable copy saved to ${savedPath}.`} />}
    </Section>
  );
}

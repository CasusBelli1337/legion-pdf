/**
 * The signature library, as the panel sees it: a list of stored PNGs and a way
 * to add one.
 *
 * Importing goes through `file.pathForDrop`, which is Electron's supported way
 * to learn where a File actually lives (webUtils). That works for a file picked
 * from a file input and for one dropped on the panel, so both routes share one
 * code path and neither needs a second IPC channel.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SignatureAsset } from '@shared/types';
import { describeError } from '@renderer/features/stamps';

export interface SignatureLibraryState {
  signatures: SignatureAsset[];
  busy: boolean;
  error: string | null;
  /** Copies a chosen or dropped PNG into the library. */
  importFile(file: File): Promise<void>;
  dismiss(): void;
}

/** "arthur-signature.png" becomes "arthur-signature". */
export function labelFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '').trim();
  return stem.length === 0 ? 'Signature' : stem;
}

export function useSignatureLibrary(): SignatureLibraryState {
  const [signatures, setSignatures] = useState<SignatureAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.librarius.stamp
      .signatureList()
      .then((stored) => {
        if (!cancelled) setSignatures(stored);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(describeError(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const importFile = useCallback(async (file: File): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const filePath = window.librarius.file.pathForDrop(file);
      if (filePath.length === 0) {
        throw new Error('Windows did not say where that file is — try dragging it onto the panel.');
      }
      await window.librarius.stamp.signatureAdd(filePath, labelFromFileName(file.name));
      setReloads((count) => count + 1);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const dismiss = useCallback(() => setError(null), []);

  return { signatures, busy, error, importFile, dismiss };
}

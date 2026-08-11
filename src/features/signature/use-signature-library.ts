/**
 * The signature library, as the panel sees it: a list of stored PNGs and a way
 * to add one.
 *
 * There are two routes in, and which one is used decides whether the attorney's
 * own file is preserved byte for byte. A PNG imported untouched goes by PATH
 * (`file.pathForDrop`, Electron's supported way to learn where a File lives),
 * so the stored image is exactly the file they picked. Anything the import
 * dialog produced — a cleaned-up scan, or a JPEG that had to become a PNG to be
 * stored at all — goes by BYTES over `stamp:signatureAddBytes`, because there
 * is no file on disk holding that image.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SignatureAsset } from '@shared/types';
import { describeError } from '@renderer/features/stamps';
import { encodePng, decodeImageFile } from './cleanup-canvas';
import type { Pixels } from './signature-cleanup';

export interface SignatureLibraryState {
  signatures: SignatureAsset[];
  busy: boolean;
  error: string | null;
  /**
   * Adds an image to the library. `cleaned` carries the pixels the import
   * dialog produced, or null to keep the chosen file as it is.
   */
  importFile(file: File, cleaned: Pixels | null): Promise<void>;
  /** Deletes a stored signature; the list becomes what the main process returns. */
  remove(signatureId: string): Promise<void>;
  dismiss(): void;
}

/** "arthur-signature.png" becomes "arthur-signature". */
export function labelFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, '').trim();
  return stem.length === 0 ? 'Signature' : stem;
}

/** True for a file the library can store without re-encoding it first. */
export function isStorablePng(file: File): boolean {
  return file.type.toLowerCase().includes('png') || /\.png$/i.test(file.name);
}

/** The two routes in, chosen so an untouched PNG is never re-encoded. */
async function storeImage(file: File, cleaned: Pixels | null): Promise<SignatureAsset> {
  const label = labelFromFileName(file.name);
  if (cleaned === null && isStorablePng(file)) {
    const filePath = window.librarius.file.pathForDrop(file);
    if (filePath.length === 0) {
      throw new Error('Windows did not say where that file is — try dragging it onto the panel.');
    }
    return window.librarius.stamp.signatureAdd(filePath, label);
  }
  const pixels = cleaned ?? (await decodeImageFile(file));
  return window.librarius.stamp.signatureAddBytes(await encodePng(pixels), label);
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

  const importFile = useCallback(async (file: File, cleaned: Pixels | null): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await storeImage(file, cleaned);
      setReloads((count) => count + 1);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (signatureId: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setSignatures(await window.librarius.stamp.signatureRemove(signatureId));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const dismiss = useCallback(() => setError(null), []);

  return { signatures, busy, error, importFile, remove, dismiss };
}

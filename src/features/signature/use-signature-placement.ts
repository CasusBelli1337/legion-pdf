/**
 * Moving and resizing a signature on the page before it is applied.
 *
 * Everything is measured in CLIENT pixels while the pointer is down and only
 * converted back to PDF points at the end of each move, which is what keeps
 * dragging correct on a rotated page: "right and up" on the screen is right and
 * up whatever /Rotate the page carries.
 */

import { useCallback, useState } from 'react';
import type { PdfPoint, SignatureAsset } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';

/** A signature parked on a page, not yet applied. */
export interface SignatureDraft {
  signature: SignatureAsset;
  page: number;
  /** Bottom-left as displayed, in PDF user space. */
  at: PdfPoint;
  widthPt: number;
  heightPt: number;
}

/** Height a freshly placed signature starts at, in points. */
export const DEFAULT_SIGNATURE_HEIGHT = 42;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 400;

export function aspectOf(signature: SignatureAsset): number {
  return signature.heightPx === 0 ? 3 : signature.widthPx / signature.heightPx;
}

export function draftFor(
  signature: SignatureAsset,
  page: number,
  at: PdfPoint,
  heightPt = DEFAULT_SIGNATURE_HEIGHT
): SignatureDraft {
  return { signature, page, at, heightPt, widthPt: heightPt * aspectOf(signature) };
}

export interface SignaturePlacementState {
  draft: SignatureDraft | null;
  place(signature: SignatureAsset, page: number, at: PdfPoint): void;
  moveTo(at: PdfPoint): void;
  resizeTo(heightPt: number): void;
  clear(): void;
}

export function useSignatureDraft(): SignaturePlacementState {
  const [draft, setDraft] = useState<SignatureDraft | null>(null);

  const place = useCallback((signature: SignatureAsset, page: number, at: PdfPoint) => {
    setDraft(draftFor(signature, page, at));
  }, []);

  const moveTo = useCallback((at: PdfPoint) => {
    setDraft((current) => (current === null ? null : { ...current, at }));
  }, []);

  const resizeTo = useCallback((heightPt: number) => {
    setDraft((current) => {
      if (current === null) return null;
      const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, heightPt));
      return { ...current, heightPt: height, widthPt: height * aspectOf(current.signature) };
    });
  }, []);

  const clear = useCallback(() => setDraft(null), []);

  return { draft, place, moveTo, resizeTo, clear };
}

/** The draft's bottom-left corner in client pixels, or null mid-rerender. */
export function anchorInClient(
  api: ViewerApi | null,
  draft: SignatureDraft | null
): { x: number; y: number } | null {
  if (api === null || draft === null) return null;
  return api.pdfToClient(draft.page, draft.at);
}

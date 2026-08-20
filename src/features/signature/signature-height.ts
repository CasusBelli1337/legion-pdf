/**
 * The size a signature lands at, remembered.
 *
 * An attorney's signature is the size it is: once he has dragged one to the
 * height that suits his signature block, every later placement should arrive
 * that size — on this document, on the next one, and after a restart. Nothing
 * is saved and nothing is asked; resizing IS the setting.
 *
 * Per machine, not per document: the height belongs to the scanned signature,
 * not to the file it is being dropped on.
 */

import { persistedSetting } from '@renderer/lib/persisted-settings';
import { clampHeight, DEFAULT_SIGNATURE_HEIGHT } from './placement-geometry';

/** A stored height that is not a usable number is a first run, not a tiny signature. */
export function parseSignatureHeight(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? clampHeight(raw)
    : DEFAULT_SIGNATURE_HEIGHT;
}

export const signatureHeightSetting = persistedSetting('signature-height', 1, parseSignatureHeight);

/** The height a new placement starts at: the last one resized to, or the default. */
export function placementHeight(): number {
  return signatureHeightSetting.read();
}

/** Called on every resize — the new height is the one the next placement uses. */
export function rememberPlacementHeight(heightPt: number): void {
  signatureHeightSetting.write(clampHeight(heightPt));
}

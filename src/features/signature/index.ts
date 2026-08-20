/**
 * F-6 signatures: the library, the live placements on the page, the import
 * clean-up, and the flatten-on-save gate.
 *
 * The save flow imports `./save-flattening` DIRECTLY rather than through this
 * barrel: document-actions.ts must not drag the panel's React tree (and with it
 * pdfjs, through the viewer) into every save.
 */

export { SignatureSection } from './signature-section';
export { fileUrl } from './file-url';
export { useSignatureLibrary, labelFromFileName, isStorablePng } from './use-signature-library';
export {
  usePlacementStore,
  useLivePlacements,
  useLiveSignatureCount,
  liveSignatureCount,
  placementsFor,
} from './placement-store';
export type { LivePlacement } from './placement-store';
export {
  aspectOf,
  sizeFor,
  clampHeight,
  anchorFromCentre,
  DEFAULT_SIGNATURE_HEIGHT,
  MIN_SIGNATURE_HEIGHT,
  MAX_SIGNATURE_HEIGHT,
} from './placement-geometry';
export {
  placementHeight,
  rememberPlacementHeight,
  signatureHeightSetting,
} from './signature-height';
export { flattenSignaturesFor, hasLiveSignatures, runFlatten } from './save-flattening';
export type { FlattenDeps, FlattenOutcome, FlattenResult } from './save-flattening';
export { cleanSignature, cleanByDefault, DEFAULT_SENSITIVITY } from './signature-cleanup';
export type { Pixels } from './signature-cleanup';
export { pageAtClientPoint } from './signature-drag';
export type { DropTarget, SignatureDrag } from './signature-drag';

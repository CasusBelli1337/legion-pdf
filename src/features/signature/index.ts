/** F-6 signatures: the library, the on-page placement, and the panel section. */

export { SignatureSection } from './signature-section';
export { fileUrl } from './file-url';
export { useSignatureLibrary, labelFromFileName } from './use-signature-library';
export {
  useSignatureDraft,
  draftFor,
  aspectOf,
  DEFAULT_SIGNATURE_HEIGHT,
} from './use-signature-placement';
export type { SignatureDraft, SignaturePlacementState } from './use-signature-placement';

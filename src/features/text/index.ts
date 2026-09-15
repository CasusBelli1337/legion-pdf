/** Draw-and-type: the in-place text editor the Text and Cover tools open. */

export { InPlaceEditor } from './in-place-editor';
export type { InPlaceEditorProps } from './in-place-editor';
export { DEFAULT_DRAFT, textDecorationFor } from './editor-state';
export type { TextDraft } from './editor-state';
export { matchDocumentFont, NO_TEXT_TO_MATCH } from './font-match';
export type { FontMatch, SampledFont } from './font-match';
export { sampleFontNear } from './sample-font';
export { isTypeable, toWhiteoutRect, MIN_BOX_PT } from './text-geometry';
export { BlockEditor } from './block-editor';
export type { BlockEditorProps } from './block-editor';
export { useBlockEditing } from './use-block-editing';
export type { BlockEditing, BlockPhase } from './use-block-editing';
export { NOTHING_TO_EDIT } from './edit-notes';
export type { EditNote } from './edit-notes';

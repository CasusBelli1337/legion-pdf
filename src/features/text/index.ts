/** Draw-and-type: the in-place text editor the Text and Cover tools open. */

export { InPlaceEditor } from './in-place-editor';
export type { InPlaceEditorProps } from './in-place-editor';
export { DEFAULT_DRAFT } from './editor-state';
export type { TextDraft } from './editor-state';
export { matchDocumentFont, NO_TEXT_TO_MATCH } from './font-match';
export type { FontMatch, SampledFont } from './font-match';
export { sampleFontNear } from './sample-font';
export { isTypeable, toWhiteoutRect, MIN_BOX_PT } from './text-geometry';

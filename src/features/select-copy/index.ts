/**
 * The selection-intelligence lane's public surface. The viewer lane imports
 * from here and nothing else reaches inside.
 *
 * Importing this module attempts the menu-slot registration described in
 * `register-menu.ts` — that side effect is the whole point of the import for
 * the viewer, which otherwise only needs `SelectionMenu` and the engine hook.
 */

export { SelectionMenu } from './selection-menu';
export type { SelectionMenuProps } from './selection-menu';
export {
  ensureSelectionMenuRegistered,
  isSelectionMenuRegistered,
  unregisterSelectionMenu,
} from './register-menu';
export { useSelectCopyEngine } from './use-select-copy-engine';
export { createSelectCopyEngine } from './engine';
export { createPdfjsSource } from './pdfjs-source';
export { engineForDocument } from './engine-cache';
export { classifyPage } from './page-classifier';
export {
  runsFromSelection,
  PAGE_ATTRIBUTE,
  ITEM_INDEX_ATTRIBUTE,
  SPAN_SELECTOR,
} from './dom-selection';
export { formatCite } from './cite';
export { readCitePrefix, writeCitePrefix, withCitePrefix } from './cite-prefix';
export type { PrefixTarget } from './cite-prefix';

export type {
  PageItemSource,
  SelectCopyEngineHandle,
  SelectionPage,
  SelectionPayload,
} from './engine';
export type { SelectedRun } from './dom-selection';
export type { ClassifiedPage, DocumentContext, PageInput, Quadrant } from './page-classifier';
export type { TextItemLike } from './item-geometry';
export type { CiteConfidence, SelectionCite } from './cite';
export type {
  CiteRange,
  ClassifiedItem,
  PageClassification,
  SelectCopyEngine,
  TextRole,
} from './contract';

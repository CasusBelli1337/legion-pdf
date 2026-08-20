/**
 * The splitter kit: what a resizable side panel needs, in one import. The rail
 * lives outside `app/shell`, so it reaches for this rather than for the files
 * behind it.
 */

export {
  DOCK_SIZE,
  RAIL_SIZE,
  clampWidth,
  readWidth,
  widthFromDrag,
  writeWidth,
} from './panel-size';
export type { GrowDirection, PanelSize } from './panel-size';
export { ResizeHandle } from './resize-handle';
export { usePanelWidth } from './use-panel-width';
export type { PanelWidth } from './use-panel-width';

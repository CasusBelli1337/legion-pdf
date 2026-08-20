/**
 * The line between a panel and the document — draggable, like a table rule.
 *
 * Four pixels wide with a wider invisible grab area, so it is easy to catch
 * without turning the border into a bar. It shows the brand colour while it is
 * being dragged or hovered and is otherwise just the panel border, and a
 * double-click puts the panel back to its default width.
 */

import type { PanelWidth } from './use-panel-width';

interface ResizeHandleProps {
  control: PanelWidth;
  /** Read out by screen readers, e.g. "Thumbnail rail width". */
  label: string;
}

export function ResizeHandle({ control, label }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={control.width}
      aria-valuemin={control.min}
      aria-valuemax={control.max}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={control.onPointerDown}
      onDoubleClick={control.onDoubleClick}
      onKeyDown={control.onKeyDown}
      className={`group relative z-10 w-1 shrink-0 cursor-col-resize transition-colors duration-150 focus:outline-none ${
        control.isDragging ? 'bg-brand-500' : 'bg-armory-border hover:bg-brand-400'
      } focus-visible:bg-armory-focus`}
    >
      {/* A four-pixel line is hard to grab; the target either side is not. */}
      <span aria-hidden className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

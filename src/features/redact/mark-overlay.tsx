/**
 * The marks, drawn over the pages through the viewer's overlay seam.
 *
 * A mark is deliberately NOT painted solid black on screen: while it is only
 * marked, the attorney has to be able to read what they are about to destroy.
 * It is a translucent purple box with a hard border, and the black only exists
 * once the pixels are burned. Nothing here covers the workspace — the overlay
 * sits on the page, and the panel stays in the dock beside it.
 */

import type { RedactionBox } from '@shared/types';
import type { Box, PageOverlayContext } from '@renderer/components/viewer';
import { RESIZE_HANDLES } from './mark-geometry';
import type { ResizeHandle } from './mark-geometry';
import type { MarkDrag, MarkPreview } from './use-mark-drag';

export const REDACT_OVERLAY_ID = 'redaction-marks';

const HANDLE_POSITION: Record<ResizeHandle, string> = {
  nw: '-top-1 -left-1 cursor-nwse-resize',
  ne: '-top-1 -right-1 cursor-nesw-resize',
  sw: '-bottom-1 -left-1 cursor-nesw-resize',
  se: '-bottom-1 -right-1 cursor-nwse-resize',
};

function styleOf(box: Box): { left: string; top: string; width: string; height: string } {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

interface MarkBoxProps {
  mark: RedactionBox;
  context: PageOverlayContext;
  selected: boolean;
  drag: MarkDrag;
}

function MarkBox({ mark, context, selected, drag }: MarkBoxProps) {
  const border = selected ? 'border-purple-400' : 'border-purple-600/70';
  return (
    <div
      className={`pointer-events-auto absolute cursor-move border-2 ${border} bg-purple-500/35`}
      style={styleOf(context.toLocalBox(mark.rect))}
      onPointerDown={(event) => drag.beginMove(mark, context.rect, event)}
      role="presentation"
    >
      {selected &&
        RESIZE_HANDLES.map((handle) => (
          <span
            key={handle}
            className={`absolute h-2.5 w-2.5 rounded-xs border border-armory-base bg-purple-300 ${HANDLE_POSITION[handle]}`}
            onPointerDown={(event) => drag.beginResize(mark, handle, context.rect, event)}
            role="presentation"
          />
        ))}
    </div>
  );
}

function PreviewBox({ preview, context }: { preview: MarkPreview; context: PageOverlayContext }) {
  return (
    <div
      className="absolute border-2 border-dashed border-purple-300 bg-purple-500/25"
      style={styleOf(context.toLocalBox(preview.rect))}
    />
  );
}

export interface MarkOverlayProps {
  context: PageOverlayContext;
  marks: readonly RedactionBox[];
  selectedId: string | null;
  /** True while the draw tool is armed: the page accepts a new box. */
  drawing: boolean;
  drag: MarkDrag;
}

/** Everything one page's overlay renders. Renders nothing for unmarked pages. */
export function MarkOverlay(props: MarkOverlayProps) {
  const { context, marks, selectedId, drawing, drag } = props;
  const onThisPage = marks.filter((mark) => mark.page === context.page);
  const preview = drag.preview?.page === context.page ? drag.preview : null;
  if (onThisPage.length === 0 && !drawing && preview === null) return null;

  return (
    <>
      {drawing && (
        <div
          className="pointer-events-auto absolute inset-0 cursor-crosshair"
          onPointerDown={(event) => drag.beginDraw(context.page, context.rect, event)}
          role="presentation"
        />
      )}
      {onThisPage.map((mark) => (
        <MarkBox
          key={mark.id}
          mark={mark}
          context={context}
          selected={mark.id === selectedId}
          drag={drag}
        />
      ))}
      {preview !== null && <PreviewBox preview={preview} context={context} />}
    </>
  );
}

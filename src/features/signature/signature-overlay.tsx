/**
 * The signature as it sits on the page before Apply: draggable by its body,
 * resizable by the corner handle, and outlined so it is obvious nothing has
 * been written to the file yet.
 *
 * Every pointer reading is converted through the viewer, never assumed, which
 * is what makes dragging behave on a page with a /Rotate flag: "right and up"
 * on the screen stays right and up.
 */

import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import type { SignatureDraft, SignaturePlacementState } from './use-signature-placement';

interface Grab {
  kind: 'move' | 'resize';
  /** Pointer offset from the draft's anchor at grab time, in client pixels. */
  dx: number;
  dy: number;
}

interface DragHandlers {
  start(kind: Grab['kind']): (event: ReactPointerEvent<HTMLElement>) => void;
  move(event: ReactPointerEvent<HTMLElement>): void;
  end(event: ReactPointerEvent<HTMLElement>): void;
}

function useDragHandlers(
  api: ViewerApi | null,
  draft: SignatureDraft,
  placement: SignaturePlacementState,
  scale: number
): DragHandlers {
  const grab = useRef<Grab | null>(null);

  const start = useCallback(
    (kind: Grab['kind']) =>
      (event: ReactPointerEvent<HTMLElement>): void => {
        event.stopPropagation();
        const anchor = api?.pdfToClient(draft.page, draft.at) ?? null;
        if (anchor === null) return;
        grab.current = { kind, dx: event.clientX - anchor.x, dy: event.clientY - anchor.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
    [api, draft.at, draft.page]
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const held = grab.current;
      if (held === null || api === null) return;
      if (held.kind === 'move') {
        const at = api.clientToPdf(draft.page, {
          x: event.clientX - held.dx,
          y: event.clientY - held.dy,
        });
        if (at !== null) placement.moveTo(at);
        return;
      }
      const anchor = api.pdfToClient(draft.page, draft.at);
      if (anchor !== null) placement.resizeTo((anchor.y - event.clientY) / scale);
    },
    [api, draft.at, draft.page, placement, scale]
  );

  const end = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return { start, move, end };
}

interface SignatureOverlayProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  draft: SignatureDraft;
  placement: SignaturePlacementState;
  /** file:// URL of the stored PNG. */
  source: string;
}

export function SignatureOverlay({
  api,
  context,
  draft,
  placement,
  source,
}: SignatureOverlayProps) {
  const handlers = useDragHandlers(api, draft, placement, context.scale);
  const box = context.toLocalBox({ x: draft.at.x, y: draft.at.y, width: 0, height: 0 });
  const width = draft.widthPt * context.scale;
  const height = draft.heightPt * context.scale;

  return (
    <div
      className="pointer-events-auto absolute cursor-move outline outline-1 outline-dashed outline-purple-400"
      style={{
        left: `${box.left}px`,
        top: `${box.top - height}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
      onPointerDown={handlers.start('move')}
      onPointerMove={handlers.move}
      onPointerUp={handlers.end}
      onPointerCancel={handlers.end}
    >
      <img src={source} alt="" draggable={false} className="h-full w-full object-contain" />
      <span
        role="slider"
        tabIndex={0}
        aria-label="Resize the signature"
        aria-valuenow={Math.round(draft.heightPt)}
        aria-valuemin={8}
        aria-valuemax={400}
        className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize rounded-sm border border-purple-200 bg-purple-500"
        onPointerDown={handlers.start('resize')}
        onPointerMove={handlers.move}
        onPointerUp={handlers.end}
        onPointerCancel={handlers.end}
      />
    </div>
  );
}

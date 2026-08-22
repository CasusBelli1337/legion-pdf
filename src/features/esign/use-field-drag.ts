/**
 * Moving and resizing a placed field box with the pointer.
 *
 * Every reading is taken in client pixels and converted through the viewer on
 * each move, so a drag on a page carrying a /Rotate flag still goes where the
 * pointer goes. Moving keeps the box inside its page; resizing drags the
 * corner opposite the anchor and is clamped to the house min/max sizes so a
 * field can never vanish under the cursor or swallow the page.
 */

import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PdfRect } from '@shared/types';
import type { ViewerApi } from '@renderer/components/viewer';
import { clampRect } from './field-geometry';
import { useEsignStore, type RequestField } from './request-store';
import { clampToPage } from './use-field-placement';

export type FieldGrabKind = 'move' | 'resize';

interface Grab {
  id: string;
  kind: FieldGrabKind;
  page: number;
  /** The rect at grab time — a resize keeps its bottom-left exactly here. */
  start: PdfRect;
  /** Pointer offset from the rect's bottom-left at grab time, in PDF points. */
  dx: number;
  dy: number;
}

export interface FieldDrag {
  start(field: RequestField, kind: FieldGrabKind): (event: ReactPointerEvent<HTMLElement>) => void;
  move(event: ReactPointerEvent<HTMLElement>): void;
  end(event: ReactPointerEvent<HTMLElement>): void;
}

export function useFieldDrag(api: ViewerApi | null): FieldDrag {
  const grab = useRef<Grab | null>(null);
  const moveField = useEsignStore((state) => state.moveField);
  const selectField = useEsignStore((state) => state.selectField);

  const start = useCallback(
    (field: RequestField, kind: FieldGrabKind) =>
      (event: ReactPointerEvent<HTMLElement>): void => {
        event.stopPropagation();
        selectField(field.id);
        const at = api?.clientToPdf(field.page, { x: event.clientX, y: event.clientY }) ?? null;
        if (at === null) return;
        grab.current = {
          id: field.id,
          kind,
          page: field.page,
          start: field.rect,
          dx: at.x - field.rect.x,
          dy: at.y - field.rect.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
    [api, selectField]
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const held = grab.current;
      if (held === null || api === null) return;
      const at = api.clientToPdf(held.page, { x: event.clientX, y: event.clientY });
      if (at === null) return;
      if (held.kind === 'move') {
        const rect = { ...held.start, x: at.x - held.dx, y: at.y - held.dy };
        const size = api.pageSize(held.page);
        moveField(held.id, size === null ? rect : clampToPage(rect, size));
        return;
      }
      moveField(
        held.id,
        clampRect({ ...held.start, width: at.x - held.start.x, height: at.y - held.start.y })
      );
    },
    [api, moveField]
  );

  const end = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return { start, move, end };
}

/**
 * What the Text and Cover tools draw over one page: the capture sheet, the box
 * being dragged, the box that was dragged, and — once a box is big enough to
 * type in — the in-place editor itself.
 *
 * The capture sheet and the editor are never mounted together. While the
 * attorney is typing, the page belongs to the textarea; a transparent sheet
 * over the top would swallow every click meant for it.
 */

import type { PageOverlayContext, ViewerApi } from '@renderer/components/viewer';
import type { PdfRect, TextBoxOptions } from '@shared/types';
import { InPlaceEditor, type TextDraft } from '@renderer/features/text';
import type { SampledFont } from '@renderer/features/text';
import { RectMark } from './mark-preview';
import { PlacementSurface } from './placement-surface';
import type { TextEditing } from './text-actions';
import { rectBetween } from './use-placement';

const DRAG_STYLE = 'bg-purple-400/20 outline outline-1 outline-dashed outline-purple-300';
const COVER_STYLE = 'bg-white/80 outline outline-1 outline-dashed outline-purple-400';

interface TextOverlayProps {
  api: ViewerApi | null;
  context: PageOverlayContext;
  editing: TextEditing;
}

/** The marks that belong to THIS page, so the overlay itself stays simple. */
function marksFor(editing: TextEditing, page: number) {
  const { drag, rect } = editing.placement;
  const covering = editing.tool === 'cover' && rect !== null && rect.page === page;
  return {
    live: drag !== null && drag.page === page ? rectBetween(drag.from, drag.to) : null,
    cover: covering ? rect.rect : null,
  };
}

function editorFor(editing: TextEditing, page: number): PdfRect | null {
  const open = editing.editing;
  return open !== null && open.page === page ? open.rect : null;
}

export function TextOverlay({ api, context, editing }: TextOverlayProps) {
  const { live, cover } = marksFor(editing, context.page);
  const typing = editorFor(editing, context.page);

  if (typing !== null && api !== null) {
    return (
      <InPlaceEditor
        context={context}
        rect={typing}
        seed={editing.seed}
        clientToPdf={(point) => api.clientToPdf(context.page, point)}
        onCommit={(options: TextBoxOptions, draft: TextDraft) => editing.commit(options, draft)}
        onCancel={editing.cancel}
        onSampleFont={(): Promise<SampledFont | null> => editing.sampleFont(context.page, typing)}
      />
    );
  }

  return (
    <>
      <PlacementSurface
        api={api}
        context={context}
        mode={editing.mode}
        placement={editing.placement}
      />
      {live !== null && <RectMark context={context} rect={live} className={DRAG_STYLE} />}
      {cover !== null && <RectMark context={context} rect={cover} className={COVER_STYLE} />}
    </>
  );
}

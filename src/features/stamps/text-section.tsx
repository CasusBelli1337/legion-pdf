/**
 * F-10 add text and whiteout — "whiteout and retype", the pragmatic ninety
 * percent of editing a PDF.
 *
 * The panel arms a tool and gets out of the way. Typing happens ON the page, in
 * the box the attorney drew, in the font it will be stamped in — not in a form
 * over here that fires text over there. So this section is two buttons, a line
 * of instructions, and the standing warning that covering is not redaction.
 * That last one is the difference between a production and a malpractice claim.
 */

import { useMemo } from 'react';
import {
  useViewerApi,
  type PageOverlayRenderer,
  type ViewerApi,
} from '@renderer/components/viewer';
import type { DocumentSession } from '@shared/types';
import { ActionButton, Caution, Hint } from './stamp-views';
import { useTextEditing, type TextEditing, type TextTool } from './text-actions';
import { TextOverlay } from './text-overlay';
import { useMarkOverlay } from './use-mark-overlay';
import type { StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'text-whiteout-placement';

const ARMED_LABEL: Record<TextTool, string> = {
  off: '',
  text: 'Drawing a box...',
  cover: 'Drag a box...',
};

function ToolButtons({ tool, onArm }: { tool: TextTool; onArm(next: TextTool): void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionButton
        label={tool === 'text' ? ARMED_LABEL.text : 'Add text'}
        variant={tool === 'text' ? 'primary' : 'quiet'}
        onClick={() => onArm('text')}
      />
      <ActionButton
        label={tool === 'cover' ? ARMED_LABEL.cover : 'Cover and retype'}
        variant={tool === 'cover' ? 'primary' : 'quiet'}
        onClick={() => onArm('cover')}
      />
    </div>
  );
}

function Instructions({ editing }: { editing: TextEditing }) {
  if (editing.editing !== null) {
    return (
      <Hint>
        Type in the box on the page. Ctrl+Enter places it, Esc throws it away, and the little
        toolbar beside it sets the font. Leaving it empty just leaves the area blank.
      </Hint>
    );
  }
  if (editing.tool === 'text') {
    return <Hint>Draw a box on the page and type. The text is set in the box you draw.</Hint>;
  }
  if (editing.tool === 'cover') {
    return (
      <Hint>
        Drag a box over the words to replace. Legion PDF blanks the area, deletes the text under it,
        and opens a cursor there so you can type the replacement.
      </Hint>
    );
  }
  return null;
}

/** Rebuilt on every change, because registering an overlay does not re-render. */
function useTextOverlay(api: ViewerApi | null, editing: TextEditing): PageOverlayRenderer | null {
  const idle = editing.tool === 'off' && editing.editing === null;
  return useMemo<PageOverlayRenderer | null>(
    () =>
      idle ? null : (context) => <TextOverlay api={api} context={context} editing={editing} />,
    [api, editing, idle]
  );
}

export function TextSection({
  session,
  runner,
}: {
  session: DocumentSession;
  runner: StampRunner;
}) {
  const api = useViewerApi();
  const editing = useTextEditing(session, runner);

  useMarkOverlay(api, OVERLAY_ID, useTextOverlay(api, editing));

  return (
    <div className="flex flex-col gap-2">
      <ToolButtons tool={editing.tool} onArm={editing.arm} />
      <Instructions editing={editing} />
      <Caution>
        Covering deletes the words under the box, so they no longer copy out. It does not touch text
        inside a scanned image. Use Redaction for anything that must be provably gone.
      </Caution>
    </div>
  );
}

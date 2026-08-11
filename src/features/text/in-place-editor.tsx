/**
 * Typing on the page itself. The attorney drags a box, and the box becomes the
 * text: same face, same size, same colour, same wrap width, no side panel and
 * no "insert" step.
 *
 * The honesty of the preview rests on two things. The typing surface is
 * positioned so the browser's first baseline falls exactly where pdf-lib will
 * put the engine's first baseline (see text-geometry.ts), and its width is the
 * wrap width the engine is handed — so a line that wraps on screen wraps in the
 * file.
 */

import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Box, ClientPoint, PageOverlayContext } from '@renderer/components/viewer';
import type { PdfPoint, PdfRect, TextBoxOptions } from '@shared/types';
import { decideKey, type TextDraft } from './editor-state';
import type { SampledFont } from './font-match';
import { fontBoxFor } from './measure-font';
import { editorLayout } from './text-geometry';
import { TextToolbar } from './text-toolbar';
import { TypingSurface } from './typing-surface';
import { useEditorSession } from './use-editor-session';

/** Screen room the toolbar needs above the box before it flips underneath. */
const TOOLBAR_ROOM = 72;
const TOOLBAR_GAP = 8;

function styleOf(box: Box) {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

/** The dashed box, and the element every commit is measured against. */
function BoxFrame({ box, frameRef }: { box: Box; frameRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={frameRef}
      className="absolute rounded-xs outline outline-1 outline-dashed outline-brand-400/80"
      style={styleOf(box)}
    />
  );
}

/** The toolbar sits above the box, or below it when the box is near the top. */
function ToolbarSlot({ box, children }: { box: Box; children: ReactNode }) {
  const above = box.top >= TOOLBAR_ROOM;
  return (
    <div
      className="absolute"
      style={{
        left: `${box.left}px`,
        top: `${above ? box.top - TOOLBAR_GAP : box.top + box.height + TOOLBAR_GAP}px`,
        transform: above ? 'translateY(-100%)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

export interface InPlaceEditorProps {
  context: PageOverlayContext;
  /** The box the attorney dragged, in PDF user space. */
  rect: PdfRect;
  /** What the last box was typed in, so a font choice survives into this one. */
  seed: TextDraft;
  /** Fresh viewport-to-PDF conversion for this page. Null while it is unmounted. */
  clientToPdf(point: ClientPoint): PdfPoint | null;
  /** Writes the text into the file. Resolves false when it did not land. */
  onCommit(options: TextBoxOptions, draft: TextDraft): Promise<boolean>;
  onCancel(): void;
  /** The face used by the text nearest this box, or null when there is none. */
  onSampleFont(): Promise<SampledFont | null>;
}

export function InPlaceEditor(props: InPlaceEditorProps) {
  const { context, rect, onCancel } = props;
  const frameRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const session = useEditorSession({ ...props, frameRef });
  // Text that outgrows the drawn box flows past it, exactly as the engine
  // writes it — the box sets the wrap width and the start, not a ceiling.
  const [grown, setGrown] = useState(0);
  const box = context.toLocalBox(rect);
  const { draft, phase, note, matching } = session.state;
  const measured = editorLayout(
    box,
    context.scale,
    draft.font,
    draft.fontSize,
    fontBoxFor(draft.font)
  );
  const layout = { ...measured, height: Math.max(measured.height, grown) };

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <BoxFrame box={box} frameRef={frameRef} />
      <TypingSurface
        layout={layout}
        draft={draft}
        page={context.page}
        readOnly={phase === 'saving'}
        onText={session.setText}
        onGrow={setGrown}
        onKey={(event) => {
          const intent = decideKey(event);
          if (intent === 'type') return;
          event.preventDefault();
          if (intent === 'cancel') onCancel();
          else session.commit();
        }}
        onLeave={(next) => {
          // The toolbar never takes the caret, so leaving really is leaving.
          if (next instanceof Node && rootRef.current?.contains(next) === true) return;
          session.commit();
        }}
      />
      <ToolbarSlot box={box}>
        <TextToolbar
          draft={draft}
          note={note}
          matching={matching}
          onChange={session.setStyle}
          onMatch={session.match}
        />
      </ToolbarSlot>
    </div>
  );
}

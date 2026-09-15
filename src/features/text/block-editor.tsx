/**
 * Editing a paragraph where it sits. The dashed frame is the paragraph's own
 * box; the typing surface lies over it in the document's face at the
 * document's leading, so the words on screen are the words that will be in
 * the file. The note beside it says which font the edit will land in and warns
 * before anything is committed.
 */

import { useRef, useState, type ReactNode } from 'react';
import type { PageOverlayContext } from '@renderer/components/viewer';
import type { TextEditBlock } from '@shared/types';
import { blockEditorLayout, screenFontFor, type BlockEditorLayout } from './block-editor-layout';
import type { EditNote } from './edit-notes';
import { decideKey } from './editor-state';
import { fontBoxFor } from './measure-font';
import { TypingSurface } from './typing-surface';
import type { BlockPhase } from './use-block-editing';

const NOTE_GAP = 8;
/** Screen room the note needs above the frame before it flips underneath. */
const NOTE_ROOM = 72;

const NOTE_TONE: Record<EditNote['kind'], string> = {
  info: 'text-text-secondary',
  warn: 'text-status-maintenance',
  error: 'text-danger',
};

function NoteCard({ note, phase }: { note: EditNote | null; phase: BlockPhase }) {
  return (
    <div className="pointer-events-auto flex max-w-[28rem] flex-col gap-1 rounded-md border border-armory-border bg-armory-elevated p-1.5 shadow-glow-sm">
      {note !== null && (
        <p className={`text-[11px] leading-snug ${NOTE_TONE[note.kind]}`}>{note.text}</p>
      )}
      <p className="text-[11px] leading-none text-text-muted">
        {phase === 'saving'
          ? 'Replacing the text...'
          : 'Ctrl+Enter to apply the change. Esc to leave the text as it was.'}
      </p>
    </div>
  );
}

/**
 * The paragraph's box: covered in paper white so the words being replaced do
 * not show through the words replacing them, outlined, and captioned above or
 * below. White is the paper, not a theme colour — the same choice the page
 * thumbnails make.
 */
function Frame({ layout, children }: { layout: BlockEditorLayout; children: ReactNode }) {
  const { frame } = layout;
  const above = frame.top >= NOTE_ROOM;
  return (
    <>
      <div
        className="absolute rounded-xs bg-white outline outline-1 outline-dashed outline-brand-400/80"
        style={{
          left: `${frame.left}px`,
          top: `${frame.top}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
        }}
      />
      <div
        className="absolute"
        style={{
          left: `${frame.left}px`,
          top: `${above ? frame.top - NOTE_GAP : frame.top + frame.height + NOTE_GAP}px`,
          transform: above ? 'translateY(-100%)' : undefined,
        }}
      >
        {children}
      </div>
    </>
  );
}

export interface BlockEditorProps {
  context: PageOverlayContext;
  block: TextEditBlock;
  text: string;
  phase: BlockPhase;
  note: EditNote | null;
  onText(text: string): void;
  onCommit(): void;
  onCancel(): void;
}

export function BlockEditor(props: BlockEditorProps) {
  const { context, block, text, phase, note, onText, onCommit, onCancel } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(0);
  const font = screenFontFor(block);
  const layout = blockEditorLayout(block, context, fontBoxFor(font), grown);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      <Frame layout={layout}>
        <NoteCard note={note} phase={phase} />
      </Frame>
      <TypingSurface
        layout={layout}
        draft={{
          text,
          fontSize: block.font.sizePt,
          color: block.font.colorHex,
          font,
          underline: false,
        }}
        page={block.page}
        readOnly={phase === 'saving'}
        extraStyle={layout.style}
        onText={onText}
        onGrow={setGrown}
        onKey={(event) => {
          const intent = decideKey(event);
          if (intent === 'type') return;
          event.preventDefault();
          if (intent === 'cancel') onCancel();
          else onCommit();
        }}
        onLeave={(next) => {
          if (next instanceof Node && rootRef.current?.contains(next) === true) return;
          onCommit();
        }}
      />
    </div>
  );
}

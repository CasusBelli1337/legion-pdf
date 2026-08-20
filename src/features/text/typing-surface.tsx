/**
 * The surface the attorney actually types on: a textarea dressed as the text it
 * is about to become. No border, no background, no scrollbar — the page shows
 * through, so what is on screen is what lands in the file.
 *
 * Its width is the engine's wrap width and its line height is the engine's line
 * step, which is what makes a line that wraps here wrap there.
 */

import { textDecorationFor, type TextDraft } from './editor-state';
import { cssFontStack } from './font-metrics';
import type { EditorLayout } from './text-geometry';

export interface TypingSurfaceProps {
  layout: EditorLayout;
  draft: TextDraft;
  page: number;
  readOnly: boolean;
  onText(text: string): void;
  /** How tall the text has actually grown, so the preview can follow it down. */
  onGrow(height: number): void;
  onKey(event: { key: string; ctrlKey: boolean; metaKey: boolean; preventDefault(): void }): void;
  onLeave(next: EventTarget | null): void;
}

/**
 * The engine does not clip a text box, so neither does the preview: text that
 * outgrows the drawn box flows past the bottom of it on screen exactly as it
 * will in the file. Measured by collapsing the box for one frame — cheaper and
 * steadier than a mirror element, and it leaves the DOM as it found it.
 */
function measureContent(field: HTMLTextAreaElement): number {
  const previous = field.style.height;
  field.style.height = '0px';
  const needed = field.scrollHeight;
  field.style.height = previous;
  return needed;
}

export function TypingSurface({
  layout,
  draft,
  page,
  readOnly,
  onText,
  onGrow,
  onKey,
  onLeave,
}: TypingSurfaceProps) {
  return (
    <textarea
      autoFocus
      value={draft.text}
      readOnly={readOnly}
      spellCheck={false}
      placeholder="Type here"
      aria-label={`Text for page ${page}`}
      onChange={(event) => {
        onText(event.target.value);
        onGrow(measureContent(event.currentTarget));
      }}
      onKeyDown={onKey}
      onBlur={(event) => onLeave(event.relatedTarget)}
      className="pointer-events-auto absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-text-muted"
      style={{
        left: `${layout.left}px`,
        top: `${layout.top}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        fontFamily: cssFontStack(draft.font.family),
        fontSize: `${layout.fontSizePx}px`,
        lineHeight: `${layout.lineHeightPx}px`,
        fontWeight: draft.font.bold === true ? 700 : 400,
        fontStyle: draft.font.italic === true ? 'italic' : 'normal',
        textDecoration: textDecorationFor(draft),
        color: draft.color,
        caretColor: draft.color,
      }}
    />
  );
}

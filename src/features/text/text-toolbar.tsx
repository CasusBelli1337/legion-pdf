/**
 * The little toolbar that follows the box being typed in. It sits BESIDE the
 * text, never over it, and every control changes the text you can already see —
 * there is no "apply" step between choosing a font and seeing it.
 *
 * `onMouseDown` is cancelled on the whole strip so pressing a button never
 * takes the caret out of the box: clicking away is how an edit is committed,
 * and clicking Bold is not clicking away.
 */

import type { TextFontChoice } from '@shared/types';
import { cssFontStack, type TextFamily } from './font-metrics';
import type { TextDraft } from './editor-state';

const CHIP =
  'rounded px-1.5 py-0.5 text-[11px] leading-none transition-colors duration-150 disabled:cursor-not-allowed';
const IDLE = 'text-text-secondary hover:bg-armory-interactive hover:text-text-primary';
const ON = 'bg-brand-700 text-text-on-brand';

const FAMILIES: readonly { family: TextFamily; label: string }[] = [
  { family: 'helvetica', label: 'Helvetica' },
  { family: 'times', label: 'Times' },
  { family: 'courier', label: 'Courier' },
];

function FamilyChips({
  font,
  onChange,
}: {
  font: TextFontChoice;
  onChange(font: TextFontChoice): void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {FAMILIES.map((option) => (
        <button
          key={option.family}
          type="button"
          aria-pressed={font.family === option.family}
          onClick={() => onChange({ ...font, family: option.family })}
          style={{ fontFamily: cssFontStack(option.family) }}
          className={`${CHIP} ${font.family === option.family ? ON : IDLE}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Bold and italic pick a different FACE; underline draws a rule, because none
 * of the built-in faces has an underlined cut. The attorney should not have to
 * know that, so the three sit together and behave the same.
 */
function StyleChips({
  draft,
  onChange,
}: {
  draft: TextDraft;
  onChange(patch: Partial<TextDraft>): void;
}) {
  const font = draft.font;
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={font.bold === true}
        onClick={() => onChange({ font: { ...font, bold: font.bold !== true } })}
        className={`${CHIP} font-bold ${font.bold === true ? ON : IDLE}`}
      >
        B
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={font.italic === true}
        onClick={() => onChange({ font: { ...font, italic: font.italic !== true } })}
        className={`${CHIP} italic ${font.italic === true ? ON : IDLE}`}
      >
        I
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={draft.underline}
        onClick={() => onChange({ underline: !draft.underline })}
        className={`${CHIP} underline ${draft.underline ? ON : IDLE}`}
      >
        U
      </button>
    </div>
  );
}

function SizeAndColour({
  draft,
  onChange,
}: {
  draft: TextDraft;
  onChange(patch: Partial<TextDraft>): void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        aria-label="Text size"
        value={draft.fontSize}
        min={4}
        max={96}
        onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        className="w-11 rounded border border-armory-border bg-armory-base px-1 py-0.5 font-mono text-[11px] text-text-primary outline-none focus:border-armory-focus"
      />
      <input
        type="color"
        aria-label="Text colour"
        value={draft.color}
        onChange={(event) => onChange({ color: event.target.value })}
        className="h-5 w-6 rounded border border-armory-border bg-armory-base"
      />
    </div>
  );
}

export interface TextToolbarProps {
  draft: TextDraft;
  /** Plain English about the document's own font, once it has been sampled. */
  note: string | null;
  matching: boolean;
  onChange(patch: Partial<TextDraft>): void;
  onMatch(): void;
}

export function TextToolbar({ draft, note, matching, onChange, onMatch }: TextToolbarProps) {
  return (
    <div
      className="pointer-events-auto flex max-w-[26rem] flex-col gap-1 rounded-md border border-armory-border bg-armory-elevated p-1.5 shadow-glow-sm"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FamilyChips font={draft.font} onChange={(font) => onChange({ font })} />
        <StyleChips draft={draft} onChange={onChange} />
        <SizeAndColour draft={draft} onChange={onChange} />
        <button
          type="button"
          disabled={matching}
          onClick={onMatch}
          className={`${CHIP} border border-armory-border-strong ${matching ? 'text-text-muted' : IDLE}`}
        >
          {matching ? 'Reading the page...' : 'Match document text'}
        </button>
      </div>
      {note !== null && <p className="text-[11px] leading-snug text-text-secondary">{note}</p>}
      <p className="text-[11px] leading-none text-text-muted">
        Ctrl+Enter to place it. Esc to throw it away.
      </p>
    </div>
  );
}

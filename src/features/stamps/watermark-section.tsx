/**
 * F-5 watermarks. DRAFT and CONFIDENTIAL are one click away because those two
 * are ninety percent of the job; anything else can be typed.
 */

import { useMemo, useState } from 'react';
import type { DocumentSession, WatermarkOrientation } from '@shared/types';
import { watermarkSpin } from '@shared/watermark-placement';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import { CentredMark } from './mark-preview';
import { describePageCount, parsePageRange } from './page-range';
import {
  ActionButton,
  ChoiceField,
  Field,
  Hint,
  NumberField,
  RangeField,
  TextField,
} from './stamp-views';
import { useMarkOverlay } from './use-mark-overlay';
import type { StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'watermark-preview';
const PRESETS = ['DRAFT', 'CONFIDENTIAL', 'ATTORNEY WORK PRODUCT'];

const ORIENTATIONS: readonly { value: WatermarkOrientation; label: string }[] = [
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'horizontal', label: 'Level' },
];

interface WatermarkState {
  text: string;
  orientation: WatermarkOrientation;
  opacity: number;
  fontSize: number;
  color: string;
  range: string;
}

const DEFAULTS: WatermarkState = {
  text: 'DRAFT',
  orientation: 'diagonal',
  opacity: 0.2,
  fontSize: 60,
  color: '#808080',
  range: 'all',
};

type Change = (patch: Partial<WatermarkState>) => void;

function Presets({ onPick }: { onPick(text: string): void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onPick(preset)}
          className="rounded-md border border-armory-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:border-armory-border-strong hover:text-text-primary"
        >
          {preset}
        </button>
      ))}
    </div>
  );
}

function AppearanceFields({ form, onChange }: { form: WatermarkState; onChange: Change }) {
  return (
    <>
      <TextField label="Wording" value={form.text} onChange={(text) => onChange({ text })} />
      <ChoiceField
        label="Angle"
        value={form.orientation}
        options={ORIENTATIONS}
        onChange={(orientation) => onChange({ orientation })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Text size"
          value={form.fontSize}
          min={8}
          max={200}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <NumberField
          label="Strength (0-1)"
          value={form.opacity}
          min={0.05}
          max={1}
          step={0.05}
          onChange={(opacity) => onChange({ opacity })}
        />
      </div>
      <Field label="Colour">
        <input
          type="color"
          value={form.color}
          onChange={(event) => onChange({ color: event.target.value })}
          className="h-8 w-full rounded-md border border-armory-border bg-armory-base"
        />
      </Field>
    </>
  );
}

function useWatermarkOverlay(form: WatermarkState, pages: readonly number[], blocked: boolean) {
  return useMemo<PageOverlayRenderer | null>(() => {
    if (blocked || form.text.trim().length === 0) return null;
    const marked = new Set(pages);
    return (context) =>
      marked.has(context.page) ? (
        <CentredMark
          context={context}
          spin={watermarkSpin(form.orientation)}
          mark={{
            text: form.text,
            fontSize: form.fontSize,
            color: form.color,
            opacity: form.opacity,
          }}
        />
      ) : null;
  }, [blocked, form, pages]);
}

function ApplyControls({
  form,
  pageCount,
  range,
  busy,
  onChange,
  onApply,
}: {
  form: WatermarkState;
  pageCount: number;
  range: { pages: number[]; error: string | null };
  busy: boolean;
  onChange: Change;
  onApply(): void;
}) {
  return (
    <>
      <RangeField
        pageCount={pageCount}
        value={form.range}
        error={range.error}
        note={`${describePageCount(range.pages.length)} will be watermarked.`}
        onChange={(next) => onChange({ range: next })}
      />
      <ActionButton
        label={`Watermark ${describePageCount(range.pages.length)}`}
        disabled={range.error !== null || form.text.trim().length === 0 || busy}
        onClick={onApply}
      />
      <Hint>
        The watermark is drawn into the page with real transparency, so the text underneath stays
        readable on screen and in print.
      </Hint>
    </>
  );
}

interface ApplyInputs {
  session: DocumentSession;
  runner: StampRunner;
  form: WatermarkState;
  pages: number[];
  onApplied(): void;
}

function applyWatermark({ session, runner, form, pages, onApplied }: ApplyInputs): void {
  void runner.run('Applying the watermark', async () => {
    await window.librarius.stamp.watermark(session.id, {
      text: form.text,
      pages,
      orientation: form.orientation,
      opacity: form.opacity,
      fontSize: form.fontSize,
      color: form.color,
    });
    onApplied();
    return `Watermarked ${describePageCount(pages.length)} with "${form.text}". Save the document to keep it.`;
  });
}

export function WatermarkSection({
  session,
  runner,
}: {
  session: DocumentSession;
  runner: StampRunner;
}) {
  const api = useViewerApi();
  const [form, setForm] = useState<WatermarkState>(DEFAULTS);
  // The applied watermark IS the page now; leaving the preview up over it is
  // what made one watermark look like two.
  const [applied, setApplied] = useState(false);
  const range = parsePageRange(form.range, session.pageCount);
  const change: Change = (patch) => {
    setApplied(false);
    setForm((current) => ({ ...current, ...patch }));
  };

  useMarkOverlay(
    api,
    OVERLAY_ID,
    useWatermarkOverlay(form, range.pages, applied || range.error !== null)
  );

  const apply = (): void =>
    applyWatermark({
      session,
      runner,
      form,
      pages: range.pages,
      onApplied: () => setApplied(true),
    });

  return (
    <div className="flex flex-col gap-2">
      <Presets onPick={(text) => change({ text })} />
      <AppearanceFields form={form} onChange={change} />
      <ApplyControls
        form={form}
        pageCount={session.pageCount}
        range={range}
        busy={runner.busy !== null}
        onChange={change}
        onApply={apply}
      />
    </div>
  );
}

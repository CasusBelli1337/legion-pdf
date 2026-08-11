/**
 * F-4 exhibit stamps and slip sheets.
 *
 * The label advances itself after every stamp (A, B, ... Z, AA), so a stack of
 * exhibits can be worked through without retyping — and the same label can be
 * dropped on a divider page ahead of the exhibit in one more click.
 */

import { useMemo, useState } from 'react';
import type { Corner, DocumentSession } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import { nextExhibitLabel } from './exhibit-label';
import { CornerMark } from './mark-preview';
import { describePageCount, parsePageRange } from './page-range';
import {
  ActionButton,
  ChoiceField,
  Hint,
  NumberField,
  RangeField,
  TextField,
  Toggle,
} from './stamp-views';
import { useMarkOverlay } from './use-mark-overlay';
import type { StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'exhibit-preview';

const CORNERS: readonly { value: Corner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

interface ExhibitState {
  label: string;
  position: Corner;
  fontSize: number;
  margin: number;
  bordered: boolean;
  range: string;
  slipSheetAt: number;
}

const DEFAULTS: ExhibitState = {
  label: 'EXHIBIT A',
  position: 'bottom-right',
  fontSize: 14,
  margin: 24,
  bordered: true,
  range: '1',
  slipSheetAt: 1,
};

type Change = (patch: Partial<ExhibitState>) => void;

function PlacementFields({ form, onChange }: { form: ExhibitState; onChange: Change }) {
  return (
    <>
      <ChoiceField
        label="Corner"
        value={form.position}
        options={CORNERS}
        onChange={(position) => onChange({ position })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Text size"
          value={form.fontSize}
          min={6}
          max={72}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <NumberField
          label="Margin"
          value={form.margin}
          min={0}
          max={200}
          onChange={(margin) => onChange({ margin })}
        />
      </div>
      <Toggle
        label="Bordered stamp box"
        checked={form.bordered}
        onChange={(bordered) => onChange({ bordered })}
      />
    </>
  );
}

function SlipSheetFields({
  form,
  pageCount,
  busy,
  onChange,
  onInsert,
}: {
  form: ExhibitState;
  pageCount: number;
  busy: boolean;
  onChange: Change;
  onInsert(): void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-armory-border pt-3">
      <NumberField
        label="Slip sheet goes in front of page"
        value={form.slipSheetAt}
        min={1}
        max={pageCount + 1}
        onChange={(slipSheetAt) => onChange({ slipSheetAt })}
      />
      <ActionButton label="Insert slip sheet" variant="quiet" disabled={busy} onClick={onInsert} />
      <Hint>A divider page carrying the label above, added to this document.</Hint>
    </div>
  );
}

interface ExhibitActions {
  stamp(): void;
  slipSheet(): void;
}

function useExhibitActions(
  session: DocumentSession,
  runner: StampRunner,
  form: ExhibitState,
  pages: readonly number[],
  onStamped: (nextLabel: string) => void
): ExhibitActions {
  const stamp = (): void => {
    void runner
      .run('Stamping the exhibit', async () => {
        const result = await window.librarius.stamp.exhibit(session.id, {
          label: form.label,
          pages: [...pages],
          position: form.position,
          fontSize: form.fontSize,
          margin: form.margin,
          bordered: form.bordered,
        });
        const label = result.detail.labelsApplied[0] ?? form.label;
        return `Stamped "${label}" on ${describePageCount(pages.length)}. Save the document to keep it.`;
      })
      .then(() => {
        const next = nextExhibitLabel(form.label);
        if (next !== null) onStamped(next);
      });
  };

  const slipSheet = (): void => {
    void runner.run('Inserting the slip sheet', async () => {
      await window.librarius.stamp.slipSheet(session.id, {
        label: form.label,
        atPage: form.slipSheetAt,
      });
      return `Added a "${form.label}" sheet before page ${form.slipSheetAt}. Save the document to keep it.`;
    });
  };

  return { stamp, slipSheet };
}

function useExhibitOverlay(form: ExhibitState, pages: readonly number[], blocked: boolean) {
  return useMemo<PageOverlayRenderer | null>(() => {
    if (blocked || pages.length === 0) return null;
    const marked = new Set(pages);
    return (context) =>
      marked.has(context.page) ? (
        <CornerMark
          context={context}
          corner={form.position}
          margin={form.margin}
          mark={{ text: form.label, fontSize: form.fontSize, bordered: form.bordered }}
        />
      ) : null;
  }, [blocked, form, pages]);
}

interface ExhibitSectionProps {
  session: DocumentSession;
  runner: StampRunner;
}

export function ExhibitSection({ session, runner }: ExhibitSectionProps) {
  const api = useViewerApi();
  const [form, setForm] = useState<ExhibitState>(DEFAULTS);
  const range = parsePageRange(form.range, session.pageCount);
  const change: Change = (patch) => setForm((current) => ({ ...current, ...patch }));

  useMarkOverlay(api, OVERLAY_ID, useExhibitOverlay(form, range.pages, range.error !== null));
  const actions = useExhibitActions(session, runner, form, range.pages, (label) =>
    change({ label })
  );

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Exhibit label"
        value={form.label}
        placeholder="EXHIBIT A"
        onChange={(label) => change({ label })}
      />
      <RangeField
        pageCount={session.pageCount}
        value={form.range}
        error={range.error}
        note={`${describePageCount(range.pages.length)} will carry the stamp.`}
        onChange={(next) => change({ range: next })}
      />
      <PlacementFields form={form} onChange={change} />
      <ActionButton
        label="Stamp the exhibit"
        disabled={range.error !== null || runner.busy !== null}
        onClick={actions.stamp}
      />
      <Hint>The label moves on to the next letter after each stamp.</Hint>
      <SlipSheetFields
        form={form}
        pageCount={session.pageCount}
        busy={runner.busy !== null}
        onChange={change}
        onInsert={actions.slipSheet}
      />
    </div>
  );
}

/**
 * F-4 exhibit stamps and slip sheets.
 *
 * The label advances itself after every stamp (A, B, ... Z, AA), so a stack of
 * exhibits can be worked through without retyping — and the same label can be
 * dropped on a divider page around the page on screen in one more click.
 *
 * What stamps is what the box says: the preview stands down the moment a stamp
 * lands, so the advanced label is never painted back over the ink just applied
 * (see ./exhibit-form, which owns that rule and is tested on it).
 */

import { useMemo, useState } from 'react';
import type { DocumentSession, ExhibitPosition } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import {
  EXHIBIT_START,
  afterExhibitStamp,
  editExhibit,
  slipSheetIndex,
  slipSheetReceipt,
  type ExhibitForm,
  type ExhibitPanelState,
  type SlipSheetPlacement,
} from './exhibit-form';
import { StampMark } from './mark-preview';
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

/** Every placement core can stamp, each with the words an attorney would use. */
const POSITION_LABELS: Record<ExhibitPosition, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  'bottom-center': 'Bottom center',
};

const POSITIONS = Object.entries(POSITION_LABELS).map(([value, label]) => ({
  value: value as ExhibitPosition,
  label,
}));

const SLIP_SHEET_PLACEMENTS: readonly { value: SlipSheetPlacement; label: string }[] = [
  { value: 'before', label: 'Before this page' },
  { value: 'after', label: 'After this page' },
  { value: 'at', label: 'At a page number' },
];

type Change = (patch: Partial<ExhibitForm>) => void;

function LabelFields({
  form,
  pageCount,
  range,
  onChange,
}: {
  form: ExhibitForm;
  pageCount: number;
  range: { pages: number[]; error: string | null };
  onChange: Change;
}) {
  return (
    <>
      <TextField
        label="Exhibit label"
        value={form.label}
        placeholder="EXHIBIT A"
        onChange={(label) => onChange({ label })}
      />
      <RangeField
        pageCount={pageCount}
        value={form.range}
        error={range.error}
        note={`${describePageCount(range.pages.length)} will carry the stamp.`}
        onChange={(next) => onChange({ range: next })}
      />
    </>
  );
}

function PlacementFields({ form, onChange }: { form: ExhibitForm; onChange: Change }) {
  return (
    <>
      <ChoiceField
        label="Position"
        value={form.position}
        options={POSITIONS}
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
  currentPage,
  pageCount,
  busy,
  onChange,
  onInsert,
}: {
  form: ExhibitForm;
  currentPage: number;
  pageCount: number;
  busy: boolean;
  onChange: Change;
  onInsert(): void;
}) {
  const index = slipSheetIndex(form, currentPage, pageCount);
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-armory-border pt-3">
      <ChoiceField
        label="Slip sheet placement"
        value={form.slipSheetPlacement}
        options={SLIP_SHEET_PLACEMENTS}
        onChange={(slipSheetPlacement) => onChange({ slipSheetPlacement })}
      />
      {form.slipSheetPlacement === 'at' && (
        <NumberField
          label="Slip sheet goes in front of page"
          value={form.slipSheetAt}
          min={1}
          max={pageCount + 1}
          onChange={(slipSheetAt) => onChange({ slipSheetAt })}
        />
      )}
      <ActionButton label="Insert slip sheet" variant="quiet" disabled={busy} onClick={onInsert} />
      <Hint>A divider page carrying the label above, added to this document as page {index}.</Hint>
    </div>
  );
}

interface ExhibitActions {
  stamp(): void;
  slipSheet(): void;
}

interface ActionInputs {
  session: DocumentSession;
  runner: StampRunner;
  form: ExhibitForm;
  pages: readonly number[];
  slipSheetAt: number;
  onStamped(appliedLabel: string): void;
}

function exhibitActions({
  session,
  runner,
  form,
  pages,
  slipSheetAt,
  onStamped,
}: ActionInputs): ExhibitActions {
  const stamp = (): void => {
    void runner.run('Stamping the exhibit', async () => {
      const result = await window.librarius.stamp.exhibit(session.id, {
        label: form.label,
        pages: [...pages],
        position: form.position,
        fontSize: form.fontSize,
        margin: form.margin,
        bordered: form.bordered,
      });
      // Count on from what landed on the page, and only once it has landed: a
      // stamp that failed leaves the label where the attorney left it.
      const label = result.detail.labelsApplied[0] ?? form.label;
      onStamped(label);
      return `Stamped "${label}" on ${describePageCount(pages.length)}. Save the document to keep it.`;
    });
  };

  const slipSheet = (): void => {
    void runner.run('Inserting the slip sheet', async () => {
      await window.librarius.stamp.slipSheet(session.id, {
        label: form.label,
        atPage: slipSheetAt,
      });
      return slipSheetReceipt(form.label, slipSheetAt);
    });
  };

  return { stamp, slipSheet };
}

function useExhibitOverlay(form: ExhibitForm, pages: readonly number[], blocked: boolean) {
  return useMemo<PageOverlayRenderer | null>(() => {
    if (blocked || pages.length === 0) return null;
    const marked = new Set(pages);
    return (context) =>
      marked.has(context.page) ? (
        <StampMark
          context={context}
          position={form.position}
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
  const [state, setState] = useState<ExhibitPanelState>(EXHIBIT_START);
  const { form } = state;
  const range = parsePageRange(form.range, session.pageCount);
  const currentPage = api?.currentPage ?? 1;
  const change: Change = (patch) => setState((current) => editExhibit(current, patch));

  useMarkOverlay(
    api,
    OVERLAY_ID,
    useExhibitOverlay(form, range.pages, !state.showPreview || range.error !== null)
  );

  const actions = exhibitActions({
    session,
    runner,
    form,
    pages: range.pages,
    slipSheetAt: slipSheetIndex(form, currentPage, session.pageCount),
    onStamped: (label) => setState((current) => afterExhibitStamp(current, label)),
  });

  return (
    <div className="flex flex-col gap-2">
      <LabelFields form={form} pageCount={session.pageCount} range={range} onChange={change} />
      <PlacementFields form={form} onChange={change} />
      <ActionButton
        label="Stamp the exhibit"
        disabled={range.error !== null || runner.busy !== null}
        onClick={actions.stamp}
      />
      <Hint>The label moves on to the next letter after each stamp.</Hint>
      <SlipSheetFields
        form={form}
        currentPage={currentPage}
        pageCount={session.pageCount}
        busy={runner.busy !== null}
        onChange={change}
        onInsert={actions.slipSheet}
      />
    </div>
  );
}

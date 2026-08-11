/**
 * F-5 page numbers — "Page 3 of 12" in a header or footer, independent of any
 * Bates run. "of" counts the pages being numbered, so a numbered excerpt reads
 * correctly to whoever receives the excerpt.
 */

import { useMemo, useState } from 'react';
import type { Alignment, DocumentSession } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import { BandMark } from './mark-preview';
import { describePageCount, parsePageRange } from './page-range';
import { ActionButton, ChoiceField, Hint, NumberField, RangeField, TextField } from './stamp-views';
import { renderPageNumber } from './page-number-format';
import { useMarkOverlay } from './use-mark-overlay';
import type { StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'page-number-preview';

const PLACEMENTS: readonly { value: 'header' | 'footer'; label: string }[] = [
  { value: 'header', label: 'Top' },
  { value: 'footer', label: 'Bottom' },
];

const ALIGNMENTS: readonly { value: Alignment; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

interface PageNumberState {
  template: string;
  placement: 'header' | 'footer';
  alignment: Alignment;
  fontSize: number;
  margin: number;
  startNumber: number;
  range: string;
}

const DEFAULTS: PageNumberState = {
  template: 'Page {n} of {total}',
  placement: 'footer',
  alignment: 'center',
  fontSize: 10,
  margin: 36,
  startNumber: 1,
  range: 'all',
};

type Change = (patch: Partial<PageNumberState>) => void;

function NumberFields({ form, onChange }: { form: PageNumberState; onChange: Change }) {
  return (
    <>
      <ChoiceField
        label="Position"
        value={form.placement}
        options={PLACEMENTS}
        onChange={(placement) => onChange({ placement })}
      />
      <ChoiceField
        label="Alignment"
        value={form.alignment}
        options={ALIGNMENTS}
        onChange={(alignment) => onChange({ alignment })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Text size"
          value={form.fontSize}
          min={6}
          max={48}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <NumberField
          label="Start at"
          value={form.startNumber}
          min={0}
          onChange={(startNumber) => onChange({ startNumber })}
        />
      </div>
    </>
  );
}

function useNumberApply(
  session: DocumentSession,
  runner: StampRunner,
  form: PageNumberState,
  pages: readonly number[]
): () => void {
  return () => {
    void runner.run('Adding page numbers', async () => {
      const result = await window.librarius.stamp.pageNumbers(session.id, {
        template: form.template,
        pages: [...pages],
        placement: form.placement,
        alignment: form.alignment,
        fontSize: form.fontSize,
        margin: form.margin,
        startNumber: form.startNumber,
      });
      const applied = result.detail.numbersApplied;
      return `Numbered ${describePageCount(applied.length)}: "${applied[0] ?? ''}" to "${applied.at(-1) ?? ''}". Save the document to keep it.`;
    });
  };
}

function usePageNumberOverlay(
  form: PageNumberState,
  pages: readonly number[],
  total: number,
  blocked: boolean
) {
  return useMemo<PageOverlayRenderer | null>(() => {
    if (blocked || pages.length === 0) return null;
    const ordinals = new Map(pages.map((page, index) => [page, index]));
    return (context) => {
      const index = ordinals.get(context.page);
      if (index === undefined) return null;
      return (
        <BandMark
          context={context}
          placement={form.placement}
          alignment={form.alignment}
          margin={form.margin}
          mark={{
            text: renderPageNumber(form.template, form.startNumber + index, total),
            fontSize: form.fontSize,
            bold: false,
          }}
        />
      );
    };
  }, [blocked, form, pages, total]);
}

export function PageNumberSection({
  session,
  runner,
}: {
  session: DocumentSession;
  runner: StampRunner;
}) {
  const api = useViewerApi();
  const [form, setForm] = useState<PageNumberState>(DEFAULTS);
  const range = parsePageRange(form.range, session.pageCount);
  const total = form.startNumber + range.pages.length - 1;
  const change: Change = (patch) => setForm((current) => ({ ...current, ...patch }));

  useMarkOverlay(
    api,
    OVERLAY_ID,
    usePageNumberOverlay(form, range.pages, total, range.error !== null)
  );
  const apply = useNumberApply(session, runner, form, range.pages);

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Pattern"
        value={form.template}
        placeholder="Page {n} of {total}"
        mono
        onChange={(template) => change({ template })}
      />
      <p className="font-mono text-xs text-brand-300">
        {renderPageNumber(form.template, form.startNumber, Math.max(form.startNumber, total))}
      </p>
      <NumberFields form={form} onChange={change} />
      <RangeField
        pageCount={session.pageCount}
        value={form.range}
        error={range.error}
        note={`${describePageCount(range.pages.length)} will be numbered.`}
        onChange={(next) => change({ range: next })}
      />
      <ActionButton
        label={`Number ${describePageCount(range.pages.length)}`}
        disabled={range.error !== null || runner.busy !== null}
        onClick={apply}
      />
      <Hint>
        Use {'{n}'} for the page number and {'{total}'} for how many pages are numbered.
      </Hint>
    </div>
  );
}

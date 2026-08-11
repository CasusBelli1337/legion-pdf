/**
 * F-3 Bates Numbering — the dock panel.
 *
 * Two things stand between the attorney and a mis-numbered production: the
 * exact first and last string, shown before anything is applied, and a live
 * preview drawn on the real pages in the real corner. Both come from the same
 * arithmetic the main process will run (./bates-preview).
 *
 * The body is keyed by document id, so switching tabs starts a clean form
 * instead of carrying another file's page numbers.
 */

import { useMemo, useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import { useActiveSession } from '@renderer/app/store';
import { BatesFields } from './bates-form';
import {
  batesLabelAt,
  batesReceipt,
  DEFAULT_BATES_FORM,
  previewBates,
  toBatesOptions,
  type BatesForm,
} from './bates-preview';
import { CornerMark } from './mark-preview';
import { parsePageRange } from './page-range';
import { ActionButton, EmptyPanel, Hint, Problem, RunStatus } from './stamp-views';
import { useMarkOverlay } from './use-mark-overlay';
import { useStampRunner, type StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'bates-preview';

function BatesReadout({ first, last, summary }: { first: string; last: string; summary: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-armory-border bg-armory-elevated p-3">
      <span className="readout text-text-muted">First page</span>
      <span className="font-mono text-sm text-brand-300">{first}</span>
      <span className="readout mt-1 text-text-muted">Last page</span>
      <span className="font-mono text-sm text-brand-300">{last}</span>
      <span className="mt-1 text-xs text-text-secondary">{summary}</span>
    </div>
  );
}

/** The preview mark, rebuilt whenever the form changes so the page follows it. */
function useBatesOverlay(form: BatesForm, pages: readonly number[], blocked: string | null) {
  return useMemo<PageOverlayRenderer | null>(() => {
    if (blocked !== null || pages.length === 0) return null;
    const ordinals = new Map(pages.map((page, index) => [page, index]));
    return (context) => {
      const index = ordinals.get(context.page);
      if (index === undefined) return null;
      return (
        <CornerMark
          context={context}
          corner={form.position}
          margin={form.margin}
          mark={{
            text: batesLabelAt(form, index),
            fontSize: form.fontSize,
            backing: form.whiteBackingBox,
          }}
        />
      );
    };
  }, [blocked, form, pages]);
}

function BatesActions({
  runner,
  blocked,
  onApply,
}: {
  runner: StampRunner;
  blocked: string | null;
  onApply(): void;
}) {
  return (
    <div className="flex gap-2">
      <ActionButton
        label={runner.busy === null ? 'Apply Bates numbers' : 'Working...'}
        disabled={blocked !== null || runner.busy !== null}
        onClick={onApply}
      />
      {(runner.receipt !== null || runner.error !== null) && (
        <ActionButton label="Clear" variant="quiet" onClick={runner.dismiss} />
      )}
    </div>
  );
}

function BatesBody({ session }: { session: DocumentSession }) {
  const api = useViewerApi();
  const runner = useStampRunner(session.id);
  const [form, setForm] = useState<BatesForm>(DEFAULT_BATES_FORM);

  const range = parsePageRange(form.range, session.pageCount);
  const preview = previewBates(form, range.pages);
  const blocked = range.error ?? preview.problem;

  useMarkOverlay(api, OVERLAY_ID, useBatesOverlay(form, range.pages, blocked));

  const apply = (): void => {
    void runner.run('Stamping Bates numbers', async () => {
      const result = await window.librarius.stamp.bates(
        session.id,
        toBatesOptions(form, range.pages)
      );
      return batesReceipt(result.detail.batesApplied);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <Hint>
        Numbers are burned into the page, so they cannot be moved or deleted afterwards. The preview
        on the page is not saved until you press Apply.
      </Hint>

      <BatesReadout first={preview.first} last={preview.last} summary={preview.summary} />

      <BatesFields
        form={form}
        pageCount={session.pageCount}
        selectedPages={range.pages.length}
        rangeError={range.error}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      />

      {blocked !== null && <Problem message={blocked} />}
      <RunStatus
        busy={runner.busy}
        progress={runner.progress}
        error={runner.error}
        receipt={runner.receipt}
      />
      <BatesActions runner={runner} blocked={blocked} onApply={apply} />
    </div>
  );
}

export function BatesPanel() {
  const session = useActiveSession();
  if (session === null) {
    return (
      <EmptyPanel
        title="No document open."
        summary="Open a PDF to stamp a continuous production number on every page."
      />
    );
  }
  return <BatesBody key={session.id} session={session} />;
}

/**
 * Export (F-13). The document as page images, one multi-page TIFF, plain text,
 * or a Word file. Everything the attorney is about to get is stated before the
 * button is pressed: how many pages, at what detail, in what colour, into which
 * folder - and, for Word, what the export will have to rebuild (`export:plan`):
 * pages that are scans and will be read by the machine first, pleading paper
 * whose numbered lines are rebuilt, Bates numbers that cannot come across.
 */

import { exportFormatInfo } from '@shared/export-formats';
import { useActiveSession } from '@renderer/app/store';
import { EmptyPanel, Section, describePageCount, parsePageRange } from '@renderer/features/stamps';
import { destinationSummary, exportButtonLabel } from './export-messages';
import {
  Destination,
  FormatPicker,
  PictureSettings,
  PlanLines,
  RangeRow,
  RunControls,
  ScanPictures,
} from './export-views';
import { useExport } from './use-export';
import type { ExportController } from './use-export';
import { useExportPlan } from './use-export-plan';

/** Only shown once the plan has found a page that is a picture of words. */
function ScannedSection({ controller }: { controller: ExportController }) {
  return (
    <Section title="Scanned pages">
      <ScanPictures
        value={controller.form.scanPictures}
        onChange={(scanPictures) => controller.update({ scanPictures })}
      />
    </Section>
  );
}

interface SectionsProps {
  docId: string;
  pageCount: number;
  controller: ExportController;
}

function ExportSections({ docId, pageCount, controller }: SectionsProps) {
  const { form, update } = controller;
  const info = exportFormatInfo(form.format);
  const range = parsePageRange(form.range, pageCount);
  const ready = form.outputPath !== null && range.error === null && range.pages.length > 0;
  const plan = useExportPlan(docId, form.format, form.range);
  const scanned = plan.plan?.scannedPages.length ?? 0;

  return (
    <div className="flex flex-col">
      <Section title="Format">
        <FormatPicker value={form.format} onChange={(format) => update({ format })} />
        <PlanLines state={plan} />
      </Section>

      {scanned > 0 && <ScannedSection controller={controller} />}

      <Section title="Pages">
        <RangeRow
          pageCount={pageCount}
          value={form.range}
          error={range.error}
          note={`${describePageCount(range.pages.length)} will be exported.`}
          onChange={(value) => update({ range: value })}
        />
      </Section>

      {info.raster && (
        <Section title="Picture settings">
          <PictureSettings form={form} update={update} />
        </Section>
      )}

      <Section title="Where it goes">
        <Destination
          summary={destinationSummary(form.format, form.outputPath)}
          onChoose={() => controller.choose()}
        />
      </Section>

      <Section title="Export">
        <RunControls
          controller={controller}
          pages={range.pages}
          disabled={!ready}
          label={exportButtonLabel(form.format, range.pages.length)}
        />
      </Section>
    </div>
  );
}

export function ExportPanel() {
  const session = useActiveSession();
  const controller = useExport(session?.id ?? null, session?.fileName ?? '');

  if (session === null) {
    return (
      <EmptyPanel
        title="No document is open"
        summary="Open a PDF to save it as a Word file, page images, a multi-page TIFF, or plain text."
      />
    );
  }
  return (
    <ExportSections docId={session.id} pageCount={session.pageCount} controller={controller} />
  );
}

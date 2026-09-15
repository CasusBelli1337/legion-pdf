/**
 * Export (F-13). The document as page images, one multi-page TIFF, plain text —
 * or a Word file once that lane lands. Everything the attorney is about to get
 * is stated before the button is pressed: how many pages, at what detail, in
 * what colour, and into which folder.
 */

import { exportFormatInfo } from '@shared/export-formats';
import { useActiveSession } from '@renderer/app/store';
import { EmptyPanel, Section, describePageCount, parsePageRange } from '@renderer/features/stamps';
import { destinationSummary, exportButtonLabel } from './export-messages';
import { Destination, FormatPicker, PictureSettings, RangeRow, RunControls } from './export-views';
import { useExport } from './use-export';
import type { ExportController } from './use-export';

interface SectionsProps {
  pageCount: number;
  controller: ExportController;
}

function ExportSections({ pageCount, controller }: SectionsProps) {
  const { form, update } = controller;
  const info = exportFormatInfo(form.format);
  const range = parsePageRange(form.range, pageCount);
  const ready = form.outputPath !== null && range.error === null && range.pages.length > 0;

  return (
    <div className="flex flex-col">
      <Section title="Format">
        <FormatPicker value={form.format} onChange={(format) => update({ format })} />
      </Section>

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
        summary="Open a PDF to save it as page images, a multi-page TIFF, or plain text."
      />
    );
  }
  return <ExportSections pageCount={session.pageCount} controller={controller} />;
}

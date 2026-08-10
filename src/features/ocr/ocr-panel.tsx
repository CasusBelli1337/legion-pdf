/**
 * Text Recognition (F-7). Finds the pages that are only pictures of words,
 * runs the bundled Tesseract over every CPU core, and writes an invisible text
 * layer so the scan becomes searchable — all on this machine, fully offline.
 */

import { useActiveSession } from '@renderer/app/store';
import { detectSummary, runButtonLabel } from './ocr-messages';
import { useOcr } from './use-ocr';
import type { OcrController } from './use-ocr';
import {
  ActionButton,
  ErrorNotice,
  PanelNotice,
  RunProgress,
  RunReceipt,
  StatusLine,
} from './ocr-panel-views';

interface ViewProps {
  controller: OcrController;
}

function CheckingView(_props: ViewProps) {
  return (
    <>
      <StatusLine label="Checking the document" tone="busy" />
      <PanelNotice>Looking for pages that have no text behind the picture.</PanelNotice>
    </>
  );
}

function RunningView({ controller }: ViewProps) {
  return (
    <>
      <StatusLine label="Reading the pages" tone="busy" />
      <RunProgress event={controller.state.progress} />
      <PanelNotice>
        Every processor core is working on this. You can keep reading the document while it runs.
      </PanelNotice>
      <ActionButton label="Cancel" variant="quiet" onClick={() => controller.cancel()} />
    </>
  );
}

function ReadyView({ controller }: ViewProps) {
  const { detected } = controller.state;
  const pages = detected?.pagesNeedingOcr ?? [];
  return (
    <>
      <StatusLine label={pages.length === 0 ? 'Nothing to do' : 'Ready'} tone="idle" />
      <PanelNotice>{detected === null ? '' : detectSummary(detected)}</PanelNotice>
      <ActionButton
        label={runButtonLabel(detected)}
        disabled={pages.length === 0}
        onClick={() => controller.start(pages)}
      />
      <PanelNotice>
        Recognition runs on this computer. Nothing is uploaded and no internet connection is needed.
      </PanelNotice>
    </>
  );
}

function DoneView({ controller }: ViewProps) {
  const { detail, detected } = controller.state;
  return (
    <>
      {detail !== null && <RunReceipt detail={detail} />}
      <PanelNotice>{detected === null ? '' : detectSummary(detected)}</PanelNotice>
      <ActionButton label="Check again" variant="quiet" onClick={() => controller.recheck()} />
    </>
  );
}

function CancelledView({ controller }: ViewProps) {
  return (
    <>
      <StatusLine label="Cancelled" tone="idle" />
      <PanelNotice>Text recognition was cancelled. The document was not changed.</PanelNotice>
      <ActionButton label="Check again" onClick={() => controller.recheck()} />
    </>
  );
}

function FailedView({ controller }: ViewProps) {
  return (
    <>
      <StatusLine label="Recognition failed" tone="idle" />
      <ErrorNotice message={controller.state.error ?? 'Text recognition could not finish.'} />
      <PanelNotice>
        Nothing was changed. Every page has to succeed before Librarius will touch the document.
      </PanelNotice>
      <ActionButton label="Try again" onClick={() => controller.recheck()} />
    </>
  );
}

const VIEWS = {
  checking: CheckingView,
  ready: ReadyView,
  running: RunningView,
  done: DoneView,
  cancelled: CancelledView,
  failed: FailedView,
} as const;

export function OcrPanel() {
  const session = useActiveSession();
  const controller = useOcr(session?.id ?? null);
  const View = VIEWS[controller.state.phase];

  if (session === null) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <StatusLine label="No document" tone="idle" />
        <PanelNotice>Open a PDF to check whether its pages carry searchable text.</PanelNotice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <View controller={controller} />
    </div>
  );
}

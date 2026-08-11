/**
 * Redaction (F-8). Mark what has to go, then destroy it: the marked pages are
 * rebuilt from a 300 DPI picture with the marks burned into the pixels, and the
 * saved file is re-opened and searched to prove the text is gone before the
 * attorney is ever told it worked.
 */

import { useActiveSession } from '@renderer/app/store';
import {
  applyButtonLabel,
  DESTRUCTION_WARNING,
  failureText,
  markAllLabel,
  markSummary,
  SAVE_AS_NOTICE,
  searchSummary,
} from './redact-messages';
import {
  ActionButton,
  CheckboxRow,
  ErrorNotice,
  MarkList,
  PanelNotice,
  RunProgress,
  SearchBox,
  StatusLine,
  VerifiedReceipt,
  WarningNotice,
} from './redact-panel-views';
import { useRedaction } from './use-redaction';
import type { RedactionController } from './use-redaction';

interface SectionProps {
  redaction: RedactionController;
}

function MarkingSection({ redaction }: SectionProps) {
  const { search } = redaction;
  return (
    <>
      <ActionButton
        label={redaction.drawing ? 'Stop drawing boxes' : 'Draw a box on the page'}
        variant={redaction.drawing ? 'quiet' : 'primary'}
        disabled={redaction.busy}
        onClick={() => redaction.setDrawing(!redaction.drawing)}
      />
      <PanelNotice>
        {redaction.drawing
          ? 'Drag across the page to mark a region. Drag a mark to move it, drag a corner to resize, press Delete to remove it.'
          : 'Marks are reversible until you apply them.'}
      </PanelNotice>

      <SearchBox
        query={search.query}
        onQuery={search.setQuery}
        onSearch={search.run}
        searching={search.searching}
        disabled={redaction.busy}
      />
      <PanelNotice>{searchSummary(search.matches, search.searched)}</PanelNotice>
      {search.matches.length > 0 && (
        <ActionButton
          label={markAllLabel(search.matches)}
          variant="quiet"
          disabled={redaction.busy}
          onClick={redaction.markAllMatches}
        />
      )}
      {search.error !== null && <ErrorNotice message={search.error} />}
    </>
  );
}

function MarksSection({ redaction }: SectionProps) {
  return (
    <>
      <StatusLine label={markSummary(redaction.marks.length)} tone="idle" />
      <MarkList
        marks={redaction.marks}
        selectedId={redaction.selectedId}
        onSelect={redaction.selectMark}
        onRemove={redaction.removeMark}
        disabled={redaction.busy}
      />
      {redaction.marks.length > 0 && (
        <ActionButton
          label="Remove every mark"
          variant="quiet"
          disabled={redaction.busy}
          onClick={redaction.clearMarks}
        />
      )}
    </>
  );
}

function ApplySection({ redaction }: SectionProps) {
  return (
    <>
      <CheckboxRow
        label="Keep the redacted pages searchable"
        hint="Reads the blacked-out pages back with text recognition, so the rest of the page can still be searched. The destroyed text cannot come back."
        checked={redaction.reOcr}
        disabled={redaction.busy}
        onChange={redaction.setReOcr}
      />
      <WarningNotice>{DESTRUCTION_WARNING}</WarningNotice>
      <ActionButton
        label={applyButtonLabel(redaction.marks.length)}
        variant="danger"
        disabled={redaction.busy || redaction.marks.length === 0}
        onClick={redaction.apply}
      />
      <PanelNotice>{SAVE_AS_NOTICE}</PanelNotice>
    </>
  );
}

function RunningView({ redaction }: SectionProps) {
  return (
    <>
      <StatusLine label="Destroying the marked content" tone="busy" />
      <RunProgress event={redaction.run.state.progress} />
      <PanelNotice>
        Each marked page is being photographed at 300 dots per inch, blacked out, and rebuilt from
        that picture. Nothing is saved until the check at the end passes.
      </PanelNotice>
    </>
  );
}

function DoneView({ redaction }: SectionProps) {
  const receipt = redaction.run.state.receipt;
  return (
    <>
      {receipt !== null && <VerifiedReceipt receipt={receipt} />}
      <PanelNotice>{SAVE_AS_NOTICE}</PanelNotice>
      <ActionButton label="Mark something else" onClick={redaction.run.reset} />
    </>
  );
}

function FailedView({ redaction }: SectionProps) {
  return (
    <>
      <StatusLine label="Redaction not applied" tone="idle" />
      <ErrorNotice message={redaction.run.state.error ?? failureText([], [])} />
      <PanelNotice>
        Your document was not changed. Nothing is handed over unless Librarius can prove the marked
        text is gone from the saved file.
      </PanelNotice>
      <ActionButton label="Back to the marks" onClick={redaction.run.reset} />
    </>
  );
}

const VIEWS = {
  running: RunningView,
  done: DoneView,
  failed: FailedView,
} as const;

function IdleView({ redaction }: SectionProps) {
  return (
    <>
      <MarkingSection redaction={redaction} />
      <MarksSection redaction={redaction} />
      <ApplySection redaction={redaction} />
    </>
  );
}

export function RedactPanel() {
  const session = useActiveSession();
  const redaction = useRedaction();
  const View = redaction.run.state.phase === 'idle' ? IdleView : VIEWS[redaction.run.state.phase];

  if (session === null) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <StatusLine label="No document" tone="idle" />
        <PanelNotice>Open a PDF to mark and destroy content in it.</PanelNotice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <View redaction={redaction} />
    </div>
  );
}

/**
 * "OCR multiple files" — a whole folder of scans made searchable in one go,
 * with no document open. The originals are never touched: each file is saved
 * next to (or into a folder with) a new copy named "<name> (searchable).pdf".
 *
 * Movement is mandatory while it runs (UI rule 2): the file counter, the phase
 * line and the per-file status all move together, and the receipt afterwards
 * says exactly what happened to every file that was chosen.
 */

import type { BulkOcrFileResult } from '@shared/types';
import { ActionButton, ErrorNotice, PanelNotice, RunProgress, StatusLine } from './ocr-panel-views';
import {
  bulkReceipt,
  chosenSummary,
  fileCounter,
  fileNameOf,
  fileOutcome,
  liveStatusLabel,
  outputFolderLabel,
} from './bulk-ocr-messages';
import { useBulkOcr } from './use-bulk-ocr';
import type { BulkOcrController } from './use-bulk-ocr';

function Row({ name, detail, tone }: { name: string; detail: string; tone: 'plain' | 'bad' }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-armory-border px-2 py-1.5 last:border-b-0">
      <span className="truncate text-sm text-text-primary" title={name}>
        {name}
      </span>
      <span className={`text-xs ${tone === 'bad' ? 'text-danger' : 'text-text-muted'}`}>
        {detail}
      </span>
    </li>
  );
}

function ChosenFiles({ controller }: { controller: BulkOcrController }) {
  const { state } = controller;
  if (state.paths.length === 0) return null;
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-armory-border bg-armory-elevated">
      {state.paths.map((path, index) => (
        <Row
          key={path}
          name={fileNameOf(path)}
          detail={liveStatusLabel(controller.liveStatus(index))}
          tone="plain"
        />
      ))}
    </ul>
  );
}

function Receipt({ files }: { files: readonly BulkOcrFileResult[] }) {
  return (
    <div className="flex flex-col gap-2">
      <StatusLine label="Finished" tone="done" />
      <p className="text-sm leading-relaxed text-text-primary">{bulkReceipt(files)}</p>
      <ul className="max-h-64 overflow-y-auto rounded-md border border-armory-border bg-armory-elevated">
        {files.map((file) => (
          <Row
            key={file.path}
            name={fileNameOf(file.path)}
            detail={fileOutcome(file)}
            tone={file.status === 'failed' ? 'bad' : 'plain'}
          />
        ))}
      </ul>
    </div>
  );
}

function OutputChoice({ controller }: { controller: BulkOcrController }) {
  const { state } = controller;
  return (
    <div className="flex flex-col gap-2">
      <span className="readout text-text-muted">Where the finished files go</span>
      <p
        className="truncate text-sm text-text-secondary"
        title={outputFolderLabel(state.outputDir)}
      >
        {outputFolderLabel(state.outputDir)}
      </p>
      <div className="flex gap-2">
        <ActionButton
          label="Choose a folder"
          variant="quiet"
          onClick={() => controller.chooseOutputFolder()}
        />
        {state.outputDir !== null && (
          <ActionButton
            label="Beside originals"
            variant="quiet"
            onClick={() => controller.useOriginalFolders()}
          />
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={state.overwrite}
          onChange={(event) => controller.setOverwrite(event.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Replace files that are already there
      </label>
    </div>
  );
}

function RunControls({ controller }: { controller: BulkOcrController }) {
  const { state } = controller;
  if (state.phase === 'running') {
    return (
      <>
        <StatusLine label="Reading the files" tone="busy" />
        <RunProgress event={state.progress} />
        <PanelNotice>
          {`${fileCounter(state.progress)} — the originals are left exactly as they are.`}
        </PanelNotice>
        <ActionButton label="Cancel" variant="quiet" onClick={() => controller.cancel()} />
      </>
    );
  }
  return (
    <ActionButton
      label={state.paths.length === 0 ? 'Choose files first' : 'Make these files searchable'}
      disabled={state.paths.length === 0}
      onClick={() => controller.start()}
    />
  );
}

export function BulkOcrSection() {
  const controller = useBulkOcr();
  const { state } = controller;

  return (
    <section className="flex flex-col gap-3 border-t border-armory-border pt-4">
      <span className="readout text-text-muted">OCR multiple files</span>
      <PanelNotice>
        Make a stack of scans searchable in one go. Each one is saved as a new copy named
        &quot;(searchable)&quot; — your original files are never changed.
      </PanelNotice>

      <div className="flex gap-2">
        <ActionButton
          label="Choose PDFs"
          variant="quiet"
          onClick={() => controller.chooseFiles()}
        />
        {state.paths.length > 0 && state.phase !== 'running' && (
          <ActionButton label="Clear" variant="quiet" onClick={() => controller.clearFiles()} />
        )}
      </div>
      <PanelNotice>{chosenSummary(state.paths)}</PanelNotice>

      <ChosenFiles controller={controller} />
      {state.phase !== 'running' && <OutputChoice controller={controller} />}
      {state.error !== null && <ErrorNotice message={state.error} />}
      <RunControls controller={controller} />
      {state.phase === 'done' && <Receipt files={state.files} />}
    </section>
  );
}

/**
 * F-10 add text and whiteout — "whiteout and retype", the pragmatic ninety
 * percent of editing a PDF.
 *
 * The two tools share a placement overlay: text is a click, cover is a drag.
 * Cover-then-retype runs as two verified operations rather than one clever one,
 * so each proves its own page count before the next begins.
 *
 * The panel says plainly that covering is not redaction. That distinction is
 * the difference between a production and a malpractice claim.
 */

import { useMemo, useState } from 'react';
import type { DocumentSession } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import { ActionButton, Caution, Field, Hint, NumberField, TextField } from './stamp-views';
import { useTextActions } from './text-actions';
import { TextOverlay, type TextPreview } from './text-overlay';
import { useMarkOverlay } from './use-mark-overlay';
import { usePlacement, type Placement, type PlacementMode } from './use-placement';
import type { StampRunner } from './use-stamp-runner';

const OVERLAY_ID = 'text-whiteout-placement';

function ToolButtons({ mode, onArm }: { mode: PlacementMode; onArm(next: PlacementMode): void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionButton
        label={mode === 'point' ? 'Click the page...' : 'Add text'}
        variant={mode === 'point' ? 'primary' : 'quiet'}
        onClick={() => onArm('point')}
      />
      <ActionButton
        label={mode === 'rect' ? 'Drag a box...' : 'Cover an area'}
        variant={mode === 'rect' ? 'primary' : 'quiet'}
        onClick={() => onArm('rect')}
      />
    </div>
  );
}

function InkFields({
  preview,
  onChange,
}: {
  preview: TextPreview;
  onChange(patch: Partial<TextPreview>): void;
}) {
  return (
    <>
      <TextField
        label="Text"
        value={preview.text}
        placeholder="Type what to add"
        onChange={(text) => onChange({ text })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Text size"
          value={preview.fontSize}
          min={4}
          max={96}
          onChange={(fontSize) => onChange({ fontSize })}
        />
        <Field label="Colour">
          <input
            type="color"
            value={preview.color}
            onChange={(event) => onChange({ color: event.target.value })}
            className="h-8 w-full rounded-md border border-armory-border bg-armory-base"
          />
        </Field>
      </div>
    </>
  );
}

function Actions({
  placement,
  hasText,
  busy,
  onAddText,
  onCover,
}: {
  placement: Placement;
  hasText: boolean;
  busy: boolean;
  onAddText(): void;
  onCover(retype: boolean): void;
}) {
  return (
    <>
      {placement.point !== null && (
        <ActionButton
          label={`Add this text to page ${placement.point.page}`}
          disabled={!hasText || busy}
          onClick={onAddText}
        />
      )}
      {placement.rect !== null && (
        <>
          <ActionButton
            label={`Cover this area on page ${placement.rect.page}`}
            disabled={busy}
            onClick={() => onCover(false)}
          />
          <ActionButton
            label="Cover it and type over it"
            variant="quiet"
            disabled={!hasText || busy}
            onClick={() => onCover(true)}
          />
        </>
      )}
    </>
  );
}

const DEFAULT_INK: TextPreview = { text: '', fontSize: 12, color: '#000000' };

/** Rebuilt on every change, because registering an overlay does not re-render. */
function useTextOverlay(
  api: ReturnType<typeof useViewerApi>,
  mode: PlacementMode,
  placement: Placement,
  ink: TextPreview
): PageOverlayRenderer | null {
  const idle = mode === 'off' && placement.point === null && placement.rect === null;
  return useMemo<PageOverlayRenderer | null>(
    () =>
      idle
        ? null
        : (context) => (
            <TextOverlay
              api={api}
              context={context}
              mode={mode}
              placement={placement}
              preview={ink}
            />
          ),
    [api, idle, ink, mode, placement]
  );
}

export function TextSection({
  session,
  runner,
}: {
  session: DocumentSession;
  runner: StampRunner;
}) {
  const api = useViewerApi();
  const [mode, setMode] = useState<PlacementMode>('off');
  const [ink, setInk] = useState<TextPreview>(DEFAULT_INK);
  const placement = usePlacement(mode);

  useMarkOverlay(api, OVERLAY_ID, useTextOverlay(api, mode, placement, ink));

  const actions = useTextActions(session, runner, placement, ink, () => {
    placement.clear();
    setMode('off');
  });

  return (
    <div className="flex flex-col gap-2">
      <ToolButtons
        mode={mode}
        onArm={(next) => {
          placement.clear();
          setMode((current) => (current === next ? 'off' : next));
        }}
      />
      <InkFields
        preview={ink}
        onChange={(patch) => setInk((current) => ({ ...current, ...patch }))}
      />
      <Actions
        placement={placement}
        hasText={ink.text.trim().length > 0}
        busy={runner.busy !== null}
        onAddText={actions.addText}
        onCover={actions.cover}
      />
      {mode !== 'off' && placement.point === null && placement.rect === null && (
        <Hint>
          {mode === 'point'
            ? 'Click where the text should start. The click is the bottom-left of the first line.'
            : 'Drag a box over what to cover.'}
        </Hint>
      )}
      <Caution>
        Covering hides content, it does not destroy it. Use Redaction for anything that must be gone
        from the file.
      </Caution>
    </div>
  );
}

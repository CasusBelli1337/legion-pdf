/**
 * F-6 signatures — the section inside Stamps & Marks.
 *
 * Pick a signature, click the page, nudge it into place, then Apply. Applying
 * flattens the image into the page content: reopened anywhere else there is no
 * annotation to select, move, or delete, which is the whole reason a signed PDF
 * is worth anything.
 */

import { useMemo, useState } from 'react';
import type { DocumentSession, SignatureAsset } from '@shared/types';
import { useViewerApi, type PageOverlayRenderer } from '@renderer/components/viewer';
import {
  ActionButton,
  Caution,
  ChoiceField,
  ClickSurface,
  Hint,
  NumberField,
  Problem,
  Toggle,
  useMarkOverlay,
  type StampRunner,
} from '@renderer/features/stamps';
import { fileUrl } from './file-url';
import { SignatureLibraryView } from './signature-library-view';
import { SignatureOverlay } from './signature-overlay';
import { useSignatureLibrary } from './use-signature-library';
import { useSignatureDraft } from './use-signature-placement';

const OVERLAY_ID = 'signature-placement';

const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: '08/10/2026' },
  { value: 'MMMM D, YYYY', label: 'August 10, 2026' },
] as const;

type DateFormatValue = (typeof DATE_FORMATS)[number]['value'];

interface DateStamp {
  withDate: boolean;
  dateFormat: DateFormatValue;
}

interface DraftControlsProps {
  page: number;
  heightPt: number;
  busy: boolean;
  date: DateStamp;
  onHeight(height: number): void;
  onDate(patch: Partial<DateStamp>): void;
  onApply(): void;
  onCancel(): void;
}

function DraftControls(props: DraftControlsProps) {
  return (
    <>
      <NumberField
        label="Height (points)"
        value={Math.round(props.heightPt)}
        min={8}
        max={400}
        onChange={props.onHeight}
      />
      <Toggle
        label="Stamp the date beside it"
        checked={props.date.withDate}
        onChange={(withDate) => props.onDate({ withDate })}
      />
      {props.date.withDate && (
        <ChoiceField
          label="Date format"
          value={props.date.dateFormat}
          options={DATE_FORMATS}
          onChange={(dateFormat) => props.onDate({ dateFormat })}
        />
      )}
      <ActionButton
        label={`Apply to page ${props.page}`}
        disabled={props.busy}
        onClick={props.onApply}
      />
      <ActionButton label="Cancel" variant="quiet" onClick={props.onCancel} />
    </>
  );
}

function Library({
  library,
  selectedId,
  onSelect,
  onRemove,
}: {
  library: ReturnType<typeof useSignatureLibrary>;
  selectedId: string | null;
  onSelect(signature: SignatureAsset): void;
  onRemove(signature: SignatureAsset): void;
}) {
  return (
    <>
      <SignatureLibraryView
        signatures={library.signatures}
        selectedId={selectedId}
        busy={library.busy}
        onSelect={onSelect}
        onRemove={onRemove}
        onImport={(file) => void library.importFile(file)}
      />
      {library.error !== null && <Problem message={library.error} />}
    </>
  );
}

/** The click-catcher while a signature is armed, plus the draft once it lands. */
function useSignatureOverlay(
  api: ReturnType<typeof useViewerApi>,
  selected: SignatureAsset | null,
  draftState: ReturnType<typeof useSignatureDraft>
): PageOverlayRenderer | null {
  const draft = draftState.draft;
  const arming = selected !== null && draft === null;
  return useMemo<PageOverlayRenderer | null>(() => {
    if (!arming && draft === null) return null;
    return (context) => (
      <>
        {arming && selected !== null && (
          <ClickSurface
            api={api}
            context={context}
            onPoint={(page, at) => draftState.place(selected, page, at)}
          />
        )}
        {draft !== null && draft.page === context.page && (
          <SignatureOverlay
            api={api}
            context={context}
            draft={draft}
            placement={draftState}
            source={draft.signature.dataUrl ?? fileUrl(draft.signature.filePath)}
          />
        )}
      </>
    );
  }, [api, arming, draft, draftState, selected]);
}

function useApplySignature(
  session: DocumentSession,
  runner: StampRunner,
  draftState: ReturnType<typeof useSignatureDraft>,
  date: DateStamp
): () => void {
  return () => {
    const draft = draftState.draft;
    if (draft === null) return;
    void runner
      .run('Placing the signature', async () => {
        await window.librarius.stamp.signaturePlace(session.id, {
          signatureId: draft.signature.id,
          page: draft.page,
          at: draft.at,
          widthPt: draft.widthPt,
          heightPt: draft.heightPt,
          withDate: date.withDate,
          dateFormat: date.dateFormat,
        });
        return `Signed page ${draft.page}. The signature is part of the page now. Save the document to keep it.`;
      })
      .then(() => draftState.clear());
  };
}

interface SignatureSelection {
  selected: SignatureAsset | null;
  pick(signature: SignatureAsset): void;
  drop(signature: SignatureAsset): void;
}

/** Which signature is armed. Removing the armed one disarms it, never places it. */
function useSignatureSelection(
  library: ReturnType<typeof useSignatureLibrary>,
  draftState: ReturnType<typeof useSignatureDraft>
): SignatureSelection {
  const [selected, setSelected] = useState<SignatureAsset | null>(null);
  return {
    selected,
    pick: (signature) => {
      setSelected(signature);
      draftState.clear();
    },
    drop: (signature) => {
      if (selected?.id === signature.id) {
        setSelected(null);
        draftState.clear();
      }
      void library.remove(signature.id);
    },
  };
}

export function SignatureSection({
  session,
  runner,
}: {
  session: DocumentSession;
  runner: StampRunner;
}) {
  const api = useViewerApi();
  const library = useSignatureLibrary();
  const draftState = useSignatureDraft();
  const { selected, pick, drop } = useSignatureSelection(library, draftState);
  const [date, setDate] = useState<DateStamp>({ withDate: false, dateFormat: 'MM/DD/YYYY' });

  const draft = draftState.draft;
  useMarkOverlay(api, OVERLAY_ID, useSignatureOverlay(api, selected, draftState));
  const apply = useApplySignature(session, runner, draftState, date);

  return (
    <div className="flex flex-col gap-2">
      <Library
        library={library}
        selectedId={selected?.id ?? null}
        onSelect={pick}
        onRemove={drop}
      />
      {selected !== null && draft === null && (
        <Hint>
          Click the page where the signature should sit. You can move and resize it after.
        </Hint>
      )}
      {draft !== null && (
        <DraftControls
          page={draft.page}
          heightPt={draft.heightPt}
          busy={runner.busy !== null}
          date={date}
          onHeight={(height) => draftState.resizeTo(height)}
          onDate={(patch) => setDate((current) => ({ ...current, ...patch }))}
          onApply={apply}
          onCancel={() => draftState.clear()}
        />
      )}
      <Caution>
        Applying flattens the signature into the page. It cannot be moved or removed afterwards.
      </Caution>
    </div>
  );
}

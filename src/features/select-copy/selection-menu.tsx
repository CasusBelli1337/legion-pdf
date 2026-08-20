/**
 * The right-click menu over a selection: Copy, Copy with cite, Highlight,
 * Redact. Four things, one row apiece, no submenus — this appears under the
 * cursor while the attorney is reading, and anything bigger covers the page.
 *
 * It reads the selection itself rather than being handed one, so the viewer
 * lane's slot only has to say WHERE the click was. The cite is computed while
 * the menu is open and shown on its row, so nobody pastes "(5:10-15)" into a
 * brief without having seen it first — and when the printed page number had to
 * be guessed the row says "check cite" instead of pretending.
 */

import { Copy, Highlighter, Pencil, Quote, SquareSlash } from 'lucide-react';
import { useActiveSession } from '../../app/store';
import { CitePrefixEditor } from './cite-prefix-editor';
import type { PrefixTarget } from './cite-prefix';
import { useCitePrefix } from './use-cite-prefix';
import { useSelectCopyEngine } from './use-select-copy-engine';
import { useSelectionPayload } from './use-selection-payload';
import type { SelectCopyEngineHandle, SelectionPayload } from './engine';
import { MenuRow, PendingRow } from './selection-menu-rows';
import {
  copySelection,
  copySelectionWithCite,
  highlightSelection,
  liveActionDeps,
  redactSelection,
} from './menu-actions';
import type { SelectionActionDeps } from './menu-actions';

export interface SelectionMenuProps {
  /** Client coordinates of the right-click; the menu keeps itself on screen. */
  x: number;
  y: number;
  onClose?: () => void;
  /** Overrides for the slot and for tests. All default to the live wiring. */
  engine?: SelectCopyEngineHandle | null;
  deps?: SelectionActionDeps;
  target?: PrefixTarget;
  /** The selection to act on. Defaults to whatever is selected right now. */
  selection?: unknown;
}

const MENU_WIDTH = 224;
const MENU_HEIGHT = 200;

const SHELL =
  'fixed z-50 flex flex-col gap-0.5 rounded-md border border-armory-border ' +
  'bg-armory-elevated p-1 shadow-glow';

const PENCIL =
  'mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted ' +
  'hover:bg-armory-interactive hover:text-text-primary';

function clamp(value: number, size: number, limit: number): number {
  return Math.max(8, Math.min(value, limit - size - 8));
}

function citeHint(payload: SelectionPayload | null | undefined): string | undefined {
  if (payload === undefined) return undefined;
  if (payload === null || payload.cite === null) return 'no cite';
  return payload.citeConfidence === 'low' ? 'check cite' : payload.cite.formatted;
}

function targetFor(
  override: PrefixTarget | undefined,
  session: { id: string; filePath: string | null } | null
): PrefixTarget | null {
  if (override !== undefined) return override;
  return session === null ? null : { docId: session.id, filePath: session.filePath };
}

interface ItemsProps {
  payload: SelectionPayload | null | undefined;
  actions: SelectionActionDeps;
  onEditPrefix: () => void;
  run: (action: (payload: SelectionPayload) => unknown) => void;
}

function SelectionMenuItems({ payload, actions, onEditPrefix, run }: ItemsProps) {
  const ready = payload !== undefined && payload !== null;
  return (
    <>
      <MenuRow
        icon={Copy}
        label="Copy"
        disabled={!ready}
        onSelect={() => run((current) => copySelection(current, actions))}
      />
      <MenuRow
        icon={Quote}
        label="Copy with cite"
        hint={citeHint(payload)}
        disabled={!ready || payload?.cite === null}
        onSelect={() => run((current) => copySelectionWithCite(current, actions))}
      >
        <button
          type="button"
          onClick={onEditPrefix}
          aria-label="Edit the cite prefix for this document"
          title="Edit the cite prefix for this document"
          className={PENCIL}
        >
          <Pencil size={12} aria-hidden />
        </button>
      </MenuRow>
      <MenuRow
        icon={Highlighter}
        label="Highlight"
        disabled={!ready}
        onSelect={() => run((current) => highlightSelection(current, actions))}
      />
      <MenuRow
        icon={SquareSlash}
        label="Redact"
        disabled={!ready}
        onSelect={() => run((current) => redactSelection(current, actions))}
      />
    </>
  );
}

export function SelectionMenu(props: SelectionMenuProps) {
  const { x, y, onClose, engine, deps, target, selection } = props;
  const session = useActiveSession();
  const liveEngine = useSelectCopyEngine();
  const active = engine === undefined ? liveEngine : engine;

  const prefix = useCitePrefix(targetFor(target, session), active);
  const payload = useSelectionPayload(active, selection, prefix.value);
  const actions = deps ?? liveActionDeps();

  const run = (action: (payload: SelectionPayload) => unknown): void => {
    if (payload === undefined || payload === null) return;
    void Promise.resolve(action(payload))
      .catch((error: unknown) => console.error('That action could not be completed.', error))
      .finally(() => onClose?.());
  };

  return (
    <div
      role="menu"
      aria-label="Selection actions"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        left: clamp(x, MENU_WIDTH, globalThis.innerWidth ?? MENU_WIDTH * 2),
        top: clamp(y, MENU_HEIGHT, globalThis.innerHeight ?? MENU_HEIGHT * 2),
        width: MENU_WIDTH,
      }}
      className={SHELL}
    >
      {payload === undefined && <PendingRow />}
      <SelectionMenuItems
        payload={payload}
        actions={actions}
        onEditPrefix={prefix.beginEditing}
        run={run}
      />
      {prefix.editing && (
        <CitePrefixEditor value={prefix.value} onCommit={prefix.commit} onCancel={prefix.cancel} />
      )}
    </div>
  );
}

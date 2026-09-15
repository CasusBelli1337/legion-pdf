/**
 * One tab per open document; a dot marks unsaved changes.
 *
 * A tab is also a drag SOURCE: dragging one onto the reference pane shows it
 * there (see components/viewer/tab-drag.ts). Dragging a tab OUT of the window
 * into a separate OS window is not supported — Electron gives the renderer no
 * way to hand a drag to a new BrowserWindow.
 */

import { X } from 'lucide-react';
import type { DragEvent } from 'react';
import type { DocumentSession } from '@shared/types';
import { TAB_DRAG_TYPE } from '../../components/viewer';
import { useAppStore } from '../store';
import { tabLabel } from './tab-label';

interface TabBarProps {
  onClose(docId: string): void;
}

/** Characters that fit a tab at its widest (max-w-72, 12px Inter). */
const LABEL_LIMIT = 34;

/** Marks the document a tab is being dragged into the reference pane. */
function startTabDrag(event: DragEvent<HTMLElement>, docId: string): void {
  event.dataTransfer.setData(TAB_DRAG_TYPE, docId);
  event.dataTransfer.effectAllowed = 'copy';
}

/** Active, in the reference pane, or neither — each shown by its own underline. */
function shellFor(isActive: boolean, isReference: boolean): string {
  if (isActive) return 'border-b-2 border-b-brand-700 bg-armory-surface text-text-primary';
  if (isReference) return 'border-b-2 border-b-brand-400 bg-armory-surface text-text-secondary';
  return 'bg-armory-base text-text-secondary hover:bg-armory-interactive';
}

interface TabProps {
  session: DocumentSession;
  isActive: boolean;
  isReference: boolean;
  onSelect(): void;
  onClose(): void;
}

function Tab({ session, isActive, isReference, onSelect, onClose }: TabProps) {
  return (
    <div
      draggable
      onDragStart={(event) => startTabDrag(event, session.id)}
      className={`flex max-w-72 min-w-40 items-center gap-2 border-r border-armory-border px-3 text-xs transition-colors duration-150 ${shellFor(isActive, isReference)}`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        onClick={onSelect}
        title={session.filePath ?? session.fileName}
      >
        {tabLabel(session.fileName, LABEL_LIMIT)}
      </button>
      {session.dirty && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" title="Unsaved changes" />
      )}
      <button
        type="button"
        className="shrink-0 text-text-muted hover:text-text-primary"
        onClick={onClose}
        aria-label={`Close ${session.fileName}`}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

export function TabBar({ onClose }: TabBarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeId = useAppStore((state) => state.activeId);
  const splitDocId = useAppStore((state) => state.splitDocId);
  const isSplitOpen = useAppStore((state) => state.isSplitOpen);
  const setActive = useAppStore((state) => state.setActive);

  if (sessions.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-armory-border bg-armory-base">
      {sessions.map((session) => (
        <Tab
          key={session.id}
          session={session}
          isActive={session.id === activeId}
          // A tab whose document is in the reference pane is marked too, so the
          // attorney can see at a glance which two files are on screen.
          isReference={isSplitOpen && session.id === splitDocId}
          onSelect={() => setActive(session.id)}
          onClose={() => onClose(session.id)}
        />
      ))}
    </div>
  );
}

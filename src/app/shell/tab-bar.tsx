/**
 * One tab per open document; a dot marks unsaved changes.
 */

import { X } from 'lucide-react';
import { useAppStore } from '../store';

interface TabBarProps {
  onClose(docId: string): void;
}

export function TabBar({ onClose }: TabBarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeId = useAppStore((state) => state.activeId);
  const setActive = useAppStore((state) => state.setActive);

  if (sessions.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-b border-armory-border bg-armory-base">
      {sessions.map((session) => {
        const isActive = session.id === activeId;
        return (
          <div
            key={session.id}
            className={`flex min-w-40 items-center gap-2 border-r border-armory-border px-3 text-xs transition-colors duration-150 ${
              isActive
                ? 'border-b-2 border-b-purple-700 bg-armory-surface text-text-primary'
                : 'bg-armory-base text-text-secondary hover:bg-armory-interactive'
            }`}
          >
            <button
              type="button"
              className="flex-1 truncate text-left"
              onClick={() => setActive(session.id)}
              title={session.filePath ?? session.fileName}
            >
              {session.fileName}
            </button>
            {session.dirty && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500"
                title="Unsaved changes"
              />
            )}
            <button
              type="button"
              className="shrink-0 text-text-muted hover:text-text-primary"
              onClick={() => onClose(session.id)}
              aria-label={`Close ${session.fileName}`}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

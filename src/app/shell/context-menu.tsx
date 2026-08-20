/**
 * A small right-click menu in the app's own colours.
 *
 * Electron's native menu is not used for these: it renders in the OS theme,
 * ignores the Armory tokens, and cannot be screenshotted for QA. This is a
 * plain fixed-position list that keeps itself inside the window and closes on
 * Escape, on a scroll, or on a click anywhere else.
 */

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { menuPosition } from './menu-geometry';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  run(): void;
}

export interface ContextMenuAnchor {
  x: number;
  y: number;
}

interface ContextMenuProps {
  anchor: ContextMenuAnchor;
  items: readonly ContextMenuItem[];
  onClose(): void;
}

const ROW =
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-text-primary ' +
  'transition-colors duration-150 hover:bg-armory-interactive ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/** Escape, a scroll, or a click outside — all mean "put it away". */
function useDismiss(onClose: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-context-menu]') !== null) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
}

export function ContextMenu({ anchor, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 176, height: 40 });
  useDismiss(onClose);

  // Measured after the first paint, then placed: guessing the height of a menu
  // whose rows are text would put it through the bottom of the window.
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    setBox({ width: rect.width, height: rect.height });
  }, [items]);

  const position = menuPosition(anchor, box, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  return (
    <div
      ref={ref}
      data-context-menu
      role="menu"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className="fixed z-50 flex min-w-44 flex-col gap-0.5 rounded-md border border-armory-border bg-armory-elevated p-1 shadow-glow"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={ROW}
            disabled={item.disabled === true}
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            {Icon !== undefined && (
              <Icon size={13} aria-hidden className="shrink-0 text-text-muted" />
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

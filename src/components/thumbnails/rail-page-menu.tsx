/**
 * The rail's right-click menu. Its words and its order come from rail-menu.ts;
 * this only pins an icon on each entry and hands the click back, so a new item
 * never means touching two files' worth of layout.
 */

import {
  Copy,
  CornerDownRight,
  FileOutput,
  ListChecks,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ContextMenu, type ContextMenuAnchor } from '../../app/shell/context-menu';
import { railMenuEntries, type RailMenuAction, type RailMenuInput } from './rail-menu';

const ICONS: Record<RailMenuAction, LucideIcon> = {
  'go-to': CornerDownRight,
  delete: Trash2,
  extract: Copy,
  'extract-remove': FileOutput,
  'rotate-cw': RotateCw,
  'rotate-ccw': RotateCcw,
  'select-all': ListChecks,
};

interface RailPageMenuProps extends RailMenuInput {
  anchor: ContextMenuAnchor;
  onRun(action: RailMenuAction): void;
  onClose(): void;
}

export function RailPageMenu({ anchor, onRun, onClose, ...input }: RailPageMenuProps) {
  return (
    <ContextMenu
      anchor={anchor}
      onClose={onClose}
      items={railMenuEntries(input).map((entry) => ({
        id: entry.id,
        label: entry.label,
        icon: ICONS[entry.id],
        disabled: entry.disabled,
        run: () => onRun(entry.id),
      }))}
    />
  );
}

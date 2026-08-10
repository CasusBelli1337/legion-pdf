// #seam:tool-registry
/**
 * Config over code: a new tool is a new entry here and nothing else. Each
 * feature lane replaces the `panel` import of ITS OWN entry with the real
 * component and touches no other line of this file.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, EyeOff, Hash, LayoutGrid, ScanText, Stamp } from 'lucide-react';
import {
  BatesPanelPlaceholder,
  CenturionPanelPlaceholder,
  OcrPanelPlaceholder,
  OrganizePanelPlaceholder,
  RedactPanelPlaceholder,
  StampsPanelPlaceholder,
} from './shell/placeholder-panels';

export interface ToolPanel {
  /** Stable id, also the right-dock selection key. */
  id: string;
  /** Plain-English title shown in the dock header. */
  title: string;
  icon: LucideIcon;
  /** Rendered in the right dock — it pushes the document aside, never overlays it. */
  panel: ComponentType;
}

export const TOOL_PANELS: readonly ToolPanel[] = [
  { id: 'organize', title: 'Organize Pages', icon: LayoutGrid, panel: OrganizePanelPlaceholder },
  { id: 'bates', title: 'Bates Numbering', icon: Hash, panel: BatesPanelPlaceholder },
  { id: 'stamps', title: 'Stamps & Marks', icon: Stamp, panel: StampsPanelPlaceholder },
  { id: 'ocr', title: 'Text Recognition', icon: ScanText, panel: OcrPanelPlaceholder },
  { id: 'redact', title: 'Redaction', icon: EyeOff, panel: RedactPanelPlaceholder },
  { id: 'centurion', title: 'Centurion', icon: Bot, panel: CenturionPanelPlaceholder },
];

export function findToolPanel(toolId: string | null): ToolPanel | null {
  return TOOL_PANELS.find((tool) => tool.id === toolId) ?? null;
}

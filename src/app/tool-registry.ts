// #seam:tool-registry
/**
 * Config over code: a new tool is a new entry here and nothing else. Each
 * feature lane replaces the `panel` import of ITS OWN entry with the real
 * component and touches no other line of this file.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, EyeOff, FormInput, Hash, LayoutGrid, PenLine, ScanText, Stamp } from 'lucide-react';
import { CenturionPanel } from '@renderer/features/centurion';
import { EsignPanel } from '@renderer/features/esign';
import { FormsPanel } from '@renderer/features/forms';
import { OcrPanel } from '@renderer/features/ocr';
import { OrganizePanel } from '@renderer/features/organize';
import { RedactPanel } from '@renderer/features/redact';
import { BatesPanel, StampsPanel } from '@renderer/features/stamps';

export interface ToolPanel {
  /** Stable id, also the tool-dock selection key. */
  id: string;
  /** Plain-English title shown in the dock header. */
  title: string;
  icon: LucideIcon;
  /** Rendered in the left tool dock — it pushes the document aside, never overlays it. */
  panel: ComponentType;
}

export const TOOL_PANELS: readonly ToolPanel[] = [
  { id: 'organize', title: 'Organize Pages', icon: LayoutGrid, panel: OrganizePanel },
  { id: 'bates', title: 'Bates Numbering', icon: Hash, panel: BatesPanel },
  { id: 'stamps', title: 'Stamps & Marks', icon: Stamp, panel: StampsPanel },
  { id: 'forms', title: 'Fill Forms', icon: FormInput, panel: FormsPanel },
  { id: 'ocr', title: 'Text Recognition', icon: ScanText, panel: OcrPanel },
  { id: 'redact', title: 'Redaction', icon: EyeOff, panel: RedactPanel },
  { id: 'esign', title: 'E-Sign', icon: PenLine, panel: EsignPanel },
  { id: 'centurion', title: 'Centurion', icon: Bot, panel: CenturionPanel },
];

export function findToolPanel(toolId: string | null): ToolPanel | null {
  return TOOL_PANELS.find((tool) => tool.id === toolId) ?? null;
}

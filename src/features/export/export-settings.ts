/**
 * What the Export panel remembers between sessions: the format, the detail, the
 * colour treatment and the JPEG quality. The rule the owner set — whatever was
 * chosen last time is what he probably wants next time — and nothing here is
 * confidential: no file paths, no document names, no matter names.
 *
 * The destination is deliberately NOT remembered. An export that silently reuses
 * last month's folder is how files end up in the wrong matter.
 */

import { field, persistedSetting, storedFields } from '@renderer/lib/persisted-settings';
import type { ExportColorMode, ExportFormat } from '@shared/types';

/** The four the panel offers. Anything else is a typed API call, not a click. */
export const DPI_CHOICES = [150, 200, 300, 600] as const;
export const DEFAULT_DPI = 200;
export const DEFAULT_JPEG_QUALITY = 85;

const FORMATS: readonly ExportFormat[] = ['docx', 'png', 'jpeg', 'tiff', 'txt'];
const COLORS: readonly ExportColorMode[] = ['color', 'grayscale', 'bw'];

export interface ExportMemory {
  format: ExportFormat;
  dpi: number;
  color: ExportColorMode;
  quality: number;
}

function parse(raw: unknown): ExportMemory {
  const fields = storedFields(raw);
  return {
    format: field.choice(fields, 'format', FORMATS, 'png'),
    dpi: field.number(fields, 'dpi', DEFAULT_DPI, { min: 36, max: 1200 }),
    color: field.choice(fields, 'color', COLORS, 'color'),
    quality: field.number(fields, 'quality', DEFAULT_JPEG_QUALITY, { min: 1, max: 100 }),
  };
}

export const exportMemory = persistedSetting<ExportMemory>('export', 1, parse);

export function rememberExport(memory: ExportMemory): void {
  exportMemory.write({
    format: memory.format,
    dpi: memory.dpi,
    color: memory.color,
    quality: memory.quality,
  });
}

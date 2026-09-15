/**
 * The export formats the picker offers, as data. Config over code: a new
 * format is a new row here plus one exporter on the main side, and the panel
 * needs no new branch. This is a VALUE module (shared/types.ts is type-only).
 */

import type { ExportFormat } from './options-export';

export interface ExportFormatInfo {
  format: ExportFormat;
  /** Plain-English label for the picker. */
  label: string;
  /** Output extension, lowercase, no dot. */
  extension: string;
  /** A folder of per-page files, or one file. */
  output: 'folder' | 'file';
  /** True when DPI and colour controls apply. */
  raster: boolean;
  description: string;
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  {
    format: 'docx',
    label: 'Word document',
    extension: 'docx',
    output: 'file',
    raster: false,
    description: 'An editable Word file. Fonts, sizes, and layout are kept as closely as possible.',
  },
  {
    format: 'png',
    label: 'PNG images',
    extension: 'png',
    output: 'folder',
    raster: true,
    description: 'One PNG image per page.',
  },
  {
    format: 'jpeg',
    label: 'JPEG images',
    extension: 'jpg',
    output: 'folder',
    raster: true,
    description: 'One JPEG image per page. Smaller files, slightly softer.',
  },
  {
    format: 'tiff',
    label: 'TIFF (one file, every page)',
    extension: 'tif',
    output: 'file',
    raster: true,
    description: 'A single multi-page TIFF, the format productions and e-filing systems ask for.',
  },
  {
    format: 'txt',
    label: 'Plain text',
    extension: 'txt',
    output: 'file',
    raster: false,
    description: 'Just the words, page by page.',
  },
];

export function exportFormatInfo(format: ExportFormat): ExportFormatInfo {
  const info = EXPORT_FORMATS.find((entry) => entry.format === format);
  if (info === undefined) throw new Error(`Unknown export format: ${format}`);
  return info;
}

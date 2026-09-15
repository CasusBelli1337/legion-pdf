/**
 * Scanned pages' pictures after the last page of text, one full-page picture
 * per scanned page, when the attorney asked for them as an appendix. Not built
 * yet — the scan lane owns this file.
 */

import type { ISectionOptions } from 'docx';
import type { PageLayout, ScanPictureMode } from '@shared/types';

export function scanAppendixSections(
  _layouts: readonly PageLayout[],
  _mode: ScanPictureMode
): ISectionOptions[] {
  return [];
}

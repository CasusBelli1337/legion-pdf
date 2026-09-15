/**
 * The selection lane's classification, keyed for the extractor. Roles are the
 * same six words on both sides; the map form is what a per-item lookup wants.
 */

import type { LayoutTextRole } from '@shared/types';
import type { PageClassification } from '@renderer/features/select-copy';

export function rolesOf(classification: PageClassification): Map<number, LayoutTextRole> {
  return new Map(classification.items.map((item) => [item.itemIndex, item.role]));
}

/**
 * The page-number pattern, filled in. The same substitution core/stamps runs,
 * so what the panel previews is character-for-character what gets drawn.
 */

export function renderPageNumber(template: string, current: number, total: number): string {
  return template.replaceAll('{n}', String(current)).replaceAll('{total}', String(total));
}

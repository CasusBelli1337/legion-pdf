/**
 * The layouts a Word export's preview has already read, kept per document.
 *
 * The preview reads every page in the range to say exactly which pages the
 * export will keep as pictures, and the panel asks again on every change of
 * page range. Keyed on the document's own bytes — an edit replaces them, and
 * the old document's layouts go with it — each page is read once however
 * often the question is asked. A read that failed is forgotten, so the next
 * question tries again.
 */

import type { PageLayout } from '@shared/types';

type Read = Promise<PageLayout | null>;

const remembered = new WeakMap<Uint8Array, Map<number, Read>>();

export function rememberedLayout(
  bytes: Uint8Array,
  page: number,
  read: (page: number) => Read
): Read {
  let pages = remembered.get(bytes);
  if (pages === undefined) {
    pages = new Map();
    remembered.set(bytes, pages);
  }
  const known = pages.get(page);
  if (known !== undefined) return known;
  const fresh = read(page);
  pages.set(page, fresh);
  const forget = (): void => {
    if (pages.get(page) === fresh) pages.delete(page);
  };
  fresh.then((layout) => (layout === null ? forget() : undefined), forget);
  return fresh;
}

/**
 * Reading the document's own font off the page, through pdfjs.
 *
 * Two passes, because pdfjs answers the two halves in different places.
 * `getTextContent` says WHERE every run sits and gives a coarse family
 * ("serif"); only the loaded font object carries the file's real name for the
 * face ("TimesNewRomanPSMT"), and that object exists only after the page's
 * operator list has been built. The second pass is best-effort: when it fails
 * the match still happens, it just cannot name the font, and the note says so
 * rather than inventing one.
 *
 * The document comes from the viewer's own cache, so this never re-parses a
 * file that is already open.
 */

import { acquireDocument, releaseDocument } from '@renderer/components/viewer';
import type { PdfRect } from '@shared/types';
import type { SampledFont } from './font-match';
import { nearestRun, runsFromItems, type PageTextItem } from './page-fonts';

function isTextItem(item: unknown): item is PageTextItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as Partial<PageTextItem>;
  return typeof candidate.str === 'string' && typeof candidate.fontName === 'string';
}

/** The file's own name for a loaded face, when pdfjs can be made to produce it. */
function loadedFontName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' && name.trim().length > 0 ? name : null;
}

interface PageLike {
  getTextContent(): Promise<{ items: unknown[]; styles: Record<string, { fontFamily?: string }> }>;
  getOperatorList(): Promise<unknown>;
  commonObjs: { get(objId: string): unknown };
}

async function realNameOf(page: PageLike, fontKey: string): Promise<string | null> {
  try {
    await page.getOperatorList();
    return loadedFontName(page.commonObjs.get(fontKey));
  } catch {
    // A page whose fonts will not load still has a family to fall back on.
    return null;
  }
}

/**
 * The face used by the text nearest `rect` on `page`, or null when that page
 * has no text to copy a font from.
 */
export async function sampleFontNear(
  bytes: Uint8Array,
  page: number,
  rect: PdfRect
): Promise<SampledFont | null> {
  const document = await acquireDocument(bytes);
  try {
    const proxy = (await document.getPage(page)) as unknown as PageLike;
    const content = await proxy.getTextContent();
    const run = nearestRun(runsFromItems(content.items.filter(isTextItem)), rect);
    if (run === null) return null;
    const fallback = content.styles[run.fontKey]?.fontFamily;
    const name = await realNameOf(proxy, run.fontKey);
    return {
      name: name ?? '',
      ...(fallback === undefined ? {} : { fallback }),
      sizePt: run.sizePt,
    };
  } finally {
    releaseDocument(bytes);
  }
}

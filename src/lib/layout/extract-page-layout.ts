/**
 * One page, as data: every text run with its position, size, face, colour,
 * and role; every picture as PNG bytes with the box it was drawn in; every
 * rule. Read through pdfjs — the engine that draws the page on screen — so what
 * the Word file says is what the viewer showed. pdfjs is reached through the
 * narrow `PageLike` interface, which is what lets the same code run under
 * vitest against the real fixtures with the Node build.
 */

import type {
  LayoutFont,
  LayoutImage,
  LayoutTextRole,
  LayoutTextRun,
  PageLayout,
} from '@shared/types';
import { alignTextStyles } from './colour-align';
import { transformedBox, walkOperators } from './op-walk';
import type { ImageOp, OpList, OpsTable } from './op-walk';
import { stampRunIndexes } from './efiling-stamp';
import { blockOfEachText, blocksOf } from './struct-tags';
import type { BlockRef, MarkedItemLike, StructNodeLike } from './struct-tags';

export interface TextItemLike {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL?: boolean;
}

export interface FontStyleLike {
  fontFamily?: string;
  ascent?: number | null;
  descent?: number | null;
}

export interface ObjectStore {
  has(id: string): boolean;
  get(id: string, callback?: (value: unknown) => void): unknown;
}

export interface PageLike {
  view: readonly number[];
  rotate: number;
  getTextContent(options?: {
    includeMarkedContent: boolean;
  }): Promise<{ items: unknown[]; styles: Record<string, FontStyleLike> }>;
  getStructTree?(): Promise<StructNodeLike | null>;
  getOperatorList(): Promise<OpList>;
  commonObjs: ObjectStore;
  objs: ObjectStore;
}

export interface RasterizedImage {
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
}

/** Turns a pdfjs image object into PNG bytes. The renderer has a canvas; tests fake it. */
export type ImageRasterizer = (image: unknown) => Promise<RasterizedImage | null>;

export interface ExtractInput {
  page: number;
  ops: OpsTable;
  roles: ReadonlyMap<number, LayoutTextRole>;
  printedPageNumber: number | null;
  rasterize: ImageRasterizer;
}

/** How long to wait for pdfjs to deliver a font or image object. */
const OBJECT_TIMEOUT_MS = 5000;
const UNIT_SQUARE = { x: 0, y: 0, width: 1, height: 1 };

function isTextItem(item: unknown): item is TextItemLike {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as Partial<TextItemLike>;
  return typeof candidate.str === 'string' && Array.isArray(candidate.transform);
}

/** A loaded pdfjs object, waiting for it when pdfjs is still sending it. */
function objectFrom(store: ObjectStore, id: string): Promise<unknown> {
  if (store.has(id)) return Promise.resolve(store.get(id));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), OBJECT_TIMEOUT_MS);
    store.get(id, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

interface LoadedFontLike {
  name?: unknown;
  fallbackName?: unknown;
  bold?: unknown;
  italic?: unknown;
  black?: unknown;
}

function stringOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function metricsOf(style: FontStyleLike | undefined): Pick<LayoutFont, 'ascent' | 'descent'> {
  return {
    ...(typeof style?.ascent === 'number' ? { ascent: style.ascent } : {}),
    ...(typeof style?.descent === 'number' ? { descent: style.descent } : {}),
  };
}

function fontFrom(loaded: unknown, style: FontStyleLike | undefined): LayoutFont {
  const record: LoadedFontLike = typeof loaded === 'object' && loaded !== null ? loaded : {};
  const fallback = stringOf(record.fallbackName, 'serif');
  return {
    name: stringOf(record.name, ''),
    family: style?.fontFamily ?? fallback,
    bold: record.bold === true || record.black === true,
    italic: record.italic === true,
    ...metricsOf(style),
  };
}

async function fontsOf(
  page: PageLike,
  keys: ReadonlySet<string>,
  styles: Record<string, FontStyleLike>
): Promise<Record<string, LayoutFont>> {
  const fonts: Record<string, LayoutFont> = {};
  for (const key of keys) {
    fonts[key] = fontFrom(await objectFrom(page.commonObjs, key), styles[key]);
  }
  return fonts;
}

function runOf(
  item: TextItemLike,
  index: number,
  input: ExtractInput,
  style: { colorHex: string; hidden: boolean },
  block: BlockRef | undefined
): LayoutTextRun {
  const [, , c = 0, d = 0, e = 0, f = 0] = item.transform;
  const sizePt = item.height > 0 ? item.height : Math.hypot(c, d);
  return {
    text: item.str,
    x: e,
    y: f,
    width: item.width,
    sizePt,
    fontKey: item.fontName,
    colorHex: style.colorHex,
    role: input.roles.get(index) ?? 'body',
    eol: item.hasEOL === true,
    ...(style.hidden ? { hidden: true } : {}),
    ...(block === undefined ? {} : { block }),
  };
}

/**
 * The tagged PDF's block for each text item, by text-item ordinal, or an empty
 * list when the page has no structure tree. A second text read with the
 * markers included lines up item for item with the plain one.
 */
async function blocksOfTextItems(page: PageLike): Promise<(BlockRef | undefined)[]> {
  if (page.getStructTree === undefined) return [];
  const tree = await page.getStructTree().catch(() => null);
  const blocks = blocksOf(tree);
  if (blocks.size === 0) return [];
  const marked = await page.getTextContent({ includeMarkedContent: true });
  return blockOfEachText(marked.items as MarkedItemLike[], blocks);
}

async function imageOf(
  page: PageLike,
  op: ImageOp,
  input: ExtractInput
): Promise<LayoutImage | null> {
  const store = op.objId?.startsWith('g_') === true ? page.commonObjs : page.objs;
  const object = op.objId === null ? op.inline : await objectFrom(store, op.objId);
  if (object === null || object === undefined) return null;
  const raster = await input.rasterize(object);
  if (raster === null) return null;
  return { rect: transformedBox(op.ctm, UNIT_SQUARE), ...raster };
}

export async function extractPageLayout(page: PageLike, input: ExtractInput): Promise<PageLayout> {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
  const content = await page.getTextContent();
  const walk = walkOperators(await page.getOperatorList(), input.ops);
  const items = content.items.map((item) => (isTextItem(item) ? item : { str: '' }));
  const styles = alignTextStyles(items, walk.texts);
  const blocks = await blocksOfTextItems(page);
  const runs: LayoutTextRun[] = [];
  content.items.forEach((item, index) => {
    if (!isTextItem(item) || item.str.length === 0) return;
    const style = styles[index] ?? { colorHex: '#000000', hidden: false };
    runs.push(runOf(item, index, input, style, blocks[index]));
  });
  const size = { width: x1 - x0, height: y1 - y0 };
  for (const index of stampRunIndexes(runs, size)) {
    const run = runs[index];
    if (run !== undefined) run.role = 'stamp';
  }
  const images: LayoutImage[] = [];
  for (const op of walk.images) {
    const image = await imageOf(page, op, input);
    if (image !== null) images.push(image);
  }
  return {
    page: input.page,
    size,
    rotation: page.rotate,
    fonts: await fontsOf(page, new Set(runs.map((run) => run.fontKey)), content.styles),
    runs,
    images,
    rules: walk.rules.map((rect) => ({ rect })),
    printedPageNumber: input.printedPageNumber,
  };
}

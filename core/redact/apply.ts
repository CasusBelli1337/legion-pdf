/**
 * The redaction run, end to end and in one place: plan, rasterize, burn,
 * rebuild, verify.
 *
 * Rasters come from a port rather than an engine of our own — the renderer owns
 * the only pdfjs canvas, and using the SAME engine that drew the page on screen
 * is what makes "what you marked is what was destroyed" true.
 *
 * The verification pass is not a step the caller may skip: it runs here, before
 * the bytes are returned, and a failure throws. There is no code path in this
 * module that hands back an unverified document.
 */

import type { OpResult, RedactApplyOptions, RedactVerifyResult } from '@shared/types';
import { loadPdf, sealResult } from '@core/ops';
import { burnRects } from './burn';
import { pdfRectToPixels } from './geometry';
import { rebuildWithImagePages } from './image-pages';
import type { BurnedRaster } from './image-pages';
import { planRedactions } from './plan';
import type { RedactionPlan } from './plan';
import { assertVerified, censusOf, verifyRedaction } from './verify';
import type { VerifyTarget } from './verify';
import type { BurnedPage, PageRaster } from './types';

/** Plain-English phases; the panel renders them as "Rasterizing page 3 of 7". */
export const PHASE_RASTERIZE = 'Rasterizing page';
export const PHASE_REBUILD = 'Rebuilding page';
export const PHASE_VERIFY = 'Verifying';

export type RedactProgress = (
  phase: string,
  current: number,
  total: number,
  message?: string
) => void;

export interface RedactPorts {
  /** One page as a PNG at the requested DPI. Must throw rather than return empty. */
  rasterize(page: number, dpi: number): Promise<PageRaster>;
  onProgress?: RedactProgress;
}

export interface RedactionOutcome {
  result: OpResult<RedactVerifyResult>;
  plan: RedactionPlan;
  /**
   * What the SOURCE held per term, counted before anything was burned. A second
   * verification (after re-OCR) has to reuse these: the source is gone by then,
   * and re-counting the output against itself would prove nothing.
   */
  targets: VerifyTarget[];
  /**
   * The burned rasters. An optional re-OCR reads THESE, never a fresh render,
   * so the text layer it writes is derived from pixels the marks already
   * destroyed.
   */
  burned: BurnedPage[];
  /** Info fields dropped because they quoted destroyed text. */
  droppedMetadata: string[];
}

interface PageGeometry {
  rotation: number;
  crop: { x: number; y: number; width: number; height: number };
}

async function burnPages(
  bytes: Uint8Array,
  plan: RedactionPlan,
  ports: RedactPorts
): Promise<BurnedPage[]> {
  const document = await loadPdf(bytes, 'document being redacted');
  const burned: BurnedPage[] = [];
  for (const [index, page] of plan.pages.entries()) {
    ports.onProgress?.(PHASE_RASTERIZE, index + 1, plan.pages.length, `Page ${page}`);
    const raster = await ports.rasterize(page, plan.dpi);
    if (raster.png.byteLength === 0) {
      throw new Error(`Page ${page} rasterized to no image data — the redaction was abandoned.`);
    }
    burned.push(burnPage(page, raster, plan, geometryOf(document, page)));
  }
  return burned;
}

function geometryOf(document: Awaited<ReturnType<typeof loadPdf>>, page: number): PageGeometry {
  const source = document.getPage(page - 1);
  return { rotation: source.getRotation().angle, crop: source.getCropBox() };
}

function burnPage(
  page: number,
  raster: PageRaster,
  plan: RedactionPlan,
  geometry: PageGeometry
): BurnedPage {
  const marks = plan.marksByPage.get(page) ?? [];
  const rects = marks.map((rect) =>
    pdfRectToPixels(rect, geometry.rotation, geometry.crop, raster.widthPx, raster.heightPx)
  );
  const burn = burnRects(raster.png, rects);
  return {
    page,
    png: burn.png,
    widthPx: burn.widthPx,
    heightPx: burn.heightPx,
    paintedPixels: burn.paintedPixels,
  };
}

function toRasters(burned: readonly BurnedPage[]): BurnedRaster[] {
  return burned.map(({ page, png, widthPx, heightPx }) => ({ page, png, widthPx, heightPx }));
}

/**
 * Destroy every marked region and prove it. Throws — never returns a result —
 * when the proof fails, so an unverified redaction cannot be adopted, saved, or
 * shown as a success.
 *
 * What is proved is that the MARKED copies are gone. Copies of the same term on
 * pages nobody marked are none of this run's business; the receipt counts them
 * so the attorney is told, and the document is still handed back.
 */
export async function applyRedactions(
  bytes: Uint8Array,
  options: RedactApplyOptions,
  ports: RedactPorts
): Promise<RedactionOutcome> {
  const source = await loadPdf(bytes, 'document being redacted');
  const plan = planRedactions(options, source.getPageCount());
  const targets = censusOf(bytes, plan.strings, plan.markedInstances);

  const burned = await burnPages(bytes, plan, ports);
  const rebuild = await rebuildWithImagePages(
    bytes,
    toRasters(burned),
    plan.strings,
    (current, total) => ports.onProgress?.(PHASE_REBUILD, current, total)
  );

  ports.onProgress?.(PHASE_VERIFY, 1, 1);
  const verified = await verifyRedaction({
    bytes: rebuild.bytes,
    targets,
    pagesRebuilt: plan.pages,
    expectNoTextOnRebuiltPages: true,
    instancesDestroyed: plan.instanceCount,
  });
  assertVerified(verified);

  return {
    result: await sealResult(
      rebuild.bytes,
      rebuild.pagesIn,
      rebuild.pagesIn,
      verified,
      'redacted document'
    ),
    plan,
    targets,
    burned,
    droppedMetadata: rebuild.droppedMetadata,
  };
}

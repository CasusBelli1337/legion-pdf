/**
 * The picture engine against real files on disk.
 *
 * The case that matters most is the multi-page TIFF, because that is what a fax
 * server or a document scanner hands an attorney and because it is the one route
 * where pages can silently go missing: each page is decoded and re-encoded
 * separately, so a decoder that quietly stopped after page one would still
 * produce a perfectly valid one-page PDF. The fixtures are real TIFFs, built
 * with the same library that reads them, and the page count is asserted.
 *
 * .bmp/.gif/.webp are NOT covered here: they route through Electron's
 * nativeImage or a hidden Chromium window, neither of which exists in Node.
 * They are verified in the real app (docs/references/convert-to-pdf.md).
 */

import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type * as Utif from 'utif';
import type { IFD } from 'utif';
import { makePng } from '@core/ocr/png-fixture.testkit';
import { IMAGE_ENGINE } from './image-engine';

const require = createRequire(import.meta.url);
const UTIF = require('utif') as typeof Utif;

/** Image data starts well past the header so the IFD chain has room. */
const DATA_START = 4096;

interface TiffPage {
  width: number;
  height: number;
  /** Dots per inch, written as a real resolution tag. Omitted = no unit. */
  dpi?: number;
}

/** A genuine multi-page uncompressed RGBA TIFF, IFDs chained the way readers expect. */
function makeTiff(pages: TiffPage[]): Uint8Array {
  const strips: Uint8Array[] = [];
  const directories: Record<string, number[] | string[]>[] = [];
  let offset = DATA_START;
  for (const [index, page] of pages.entries()) {
    const rgba = new Uint8Array(page.width * page.height * 4);
    for (let pixel = 0; pixel < page.width * page.height; pixel += 1) {
      rgba.set([(pixel + index * 40) % 256, 20, 60, 255], pixel * 4);
    }
    strips.push(rgba);
    directories.push({
      t256: [page.width],
      t257: [page.height],
      t258: [8, 8, 8, 8],
      t259: [1],
      t262: [2],
      t273: [offset],
      t277: [4],
      t278: [page.height],
      t279: [rgba.length],
      t282: [page.dpi ?? 1],
      t283: [page.dpi ?? 1],
      t284: [1],
      t296: [page.dpi === undefined ? 1 : 2],
      t338: [1],
    });
    offset += rgba.length;
  }
  // @types/utif describes the IFD a DECODE hands back (data/width/height
  // included); the encoder wants tag keys only, and chokes on the others.
  const header = new Uint8Array(UTIF.encode(directories as unknown as IFD[]));
  if (header.length > DATA_START) throw new Error('TIFF fixture header overran its own data.');
  const out = new Uint8Array(offset);
  out.set(header, 0);
  let at = DATA_START;
  for (const strip of strips) {
    out.set(strip, at);
    at += strip.length;
  }
  return out;
}

let workspace = '';

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'legion-pdf-image-engine-'));
});

afterAll(async () => {
  if (workspace !== '') await rm(workspace, { recursive: true, force: true });
});

async function seed(name: string, bytes: Uint8Array): Promise<string> {
  const filePath = join(workspace, name);
  await writeFile(filePath, bytes);
  return filePath;
}

function job(filePath: string, extension: string) {
  return { filePath, fileName: filePath.split('/').pop() ?? '', extension };
}

async function pageSizes(bytes: Uint8Array): Promise<{ width: number; height: number }[]> {
  return (await PDFDocument.load(bytes)).getPages().map((page) => page.getSize());
}

describe('the built-in picture converter', () => {
  it('is available on every computer', async () => {
    expect(await IMAGE_ENGINE.available()).toBe(true);
  });

  it('turns a PNG into a one-page PDF', async () => {
    const png = makePng({ width: 120, height: 90, channels: 3, paint: (x) => [x, 30, 60] });
    const bytes = await IMAGE_ENGINE.run(job(await seed('scan.png', png), '.png'));

    expect(await pageSizes(bytes)).toEqual([{ width: 612, height: 792 }]);
  });

  it('keeps every page of a multi-page TIFF', async () => {
    const tiff = makeTiff([
      { width: 60, height: 80 },
      { width: 60, height: 80 },
      { width: 60, height: 80 },
    ]);
    const bytes = await IMAGE_ENGINE.run(job(await seed('fax.tif', tiff), '.tif'));

    expect(await pageSizes(bytes)).toHaveLength(3);
  });

  it("carries a TIFF's own resolution through the re-encode", async () => {
    const tiff = makeTiff([{ width: 400, height: 600, dpi: 200 }]);
    const bytes = await IMAGE_ENGINE.run(job(await seed('letter.tiff', tiff), '.tiff'));

    // 400 px / 200 dpi = 2 inches = 144 points; 600 / 200 = 3 inches = 216.
    const [size] = await pageSizes(bytes);
    expect(size?.width).toBeCloseTo(144, 3);
    expect(size?.height).toBeCloseTo(216, 3);
  });

  it('refuses an empty file by name instead of producing a blank page', async () => {
    const filePath = await seed('nothing.png', new Uint8Array(0));

    await expect(IMAGE_ENGINE.run(job(filePath, '.png'))).rejects.toThrow(/nothing\.png is empty/i);
  });

  it('refuses a file that is not really a picture', async () => {
    const filePath = await seed('fake.png', new TextEncoder().encode('this is not a PNG'));

    await expect(IMAGE_ENGINE.run(job(filePath, '.png'))).rejects.toThrow(/not a PNG or JPEG/i);
  });
});

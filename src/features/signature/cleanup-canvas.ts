/**
 * The canvas half of the signature import: file bytes in, pixels out, PNG bytes
 * back. The arithmetic lives in signature-cleanup.ts; this file only moves
 * images across the browser's edges, so nothing here needs a unit test that a
 * real import would not catch first.
 *
 * PNG is the only output format. The library gate in the main process refuses
 * anything else, and a signature has to carry transparency to sit on a page.
 */

import type { Pixels } from './signature-cleanup';

/** A photo, scan, or PNG as raw RGBA. Throws plainly rather than return empty. */
export async function decodeImageFile(file: File): Promise<Pixels> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (bitmap === null) {
    throw new Error(`Windows could not read ${file.name} as an image. Try a PNG or a JPEG.`);
  }
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context === null)
      throw new Error('The app could not open a drawing surface for that image.');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: image.data, width: image.width, height: image.height };
  } finally {
    bitmap.close();
  }
}

function toCanvas(pixels: Pixels): OffscreenCanvas {
  const canvas = new OffscreenCanvas(pixels.width, pixels.height);
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('The app could not open a drawing surface for that image.');
  context.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
  return canvas;
}

async function toPngBlob(pixels: Pixels): Promise<Blob> {
  return toCanvas(pixels).convertToBlob({ type: 'image/png' });
}

/** PNG bytes for `stamp:signatureAddBytes`. Never resolves empty. */
export async function encodePng(pixels: Pixels): Promise<Uint8Array> {
  const bytes = new Uint8Array(await (await toPngBlob(pixels)).arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('Saving the cleaned-up signature produced an empty image — nothing was added.');
  }
  return bytes;
}

/** A URL for an <img> preview. The caller revokes it when the preview changes. */
export async function previewUrl(pixels: Pixels): Promise<string> {
  return URL.createObjectURL(await toPngBlob(pixels));
}

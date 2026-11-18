import { describe, expect, it } from 'vitest';
import { measureImageObject } from './image-raster';

describe('measureImageObject', () => {
  it('answers the size of a picture without drawing it', async () => {
    const image = { width: 4, height: 2, kind: 2, data: new Uint8Array(24) };
    expect(await measureImageObject(image)).toEqual({
      png: new Uint8Array(0),
      widthPx: 4,
      heightPx: 2,
    });
  });

  it('answers null for what the rasterizer could not draw either', async () => {
    expect(await measureImageObject(null)).toBeNull();
    expect(await measureImageObject({ width: 0, height: 2 })).toBeNull();
    expect(await measureImageObject({ width: 4, height: 2 })).toBeNull();
    expect(await measureImageObject({ width: 4, height: 2, data: new Uint8Array(5) })).toBeNull();
  });
});

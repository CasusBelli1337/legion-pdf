import { describe, expect, it, vi } from 'vitest';
import type { PageLayout } from '@shared/types';
import { rememberedLayout } from './plan-layouts';

const layout = (page: number): PageLayout => ({
  page,
  size: { width: 612, height: 792 },
  rotation: 0,
  fonts: {},
  runs: [],
  images: [],
  rules: [],
  printedPageNumber: null,
});

describe('rememberedLayout', () => {
  it('reads a page of a document once, however often it is asked for', async () => {
    const bytes = new Uint8Array([1]);
    const read = vi.fn((page: number) => Promise.resolve(layout(page)));
    const first = await rememberedLayout(bytes, 2, read);
    const second = await rememberedLayout(bytes, 2, read);
    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again for another document, and for the same document after an edit', async () => {
    const read = vi.fn((page: number) => Promise.resolve(layout(page)));
    await rememberedLayout(new Uint8Array([1]), 1, read);
    await rememberedLayout(new Uint8Array([1]), 1, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('forgets a read that failed or came back empty, so the next question tries again', async () => {
    const bytes = new Uint8Array([1]);
    const failing = vi.fn(() => Promise.reject(new Error('page died')));
    await expect(rememberedLayout(bytes, 1, failing)).rejects.toThrow('page died');
    expect(await rememberedLayout(bytes, 1, () => Promise.resolve(null))).toBeNull();
    const read = vi.fn((page: number) => Promise.resolve(layout(page)));
    expect((await rememberedLayout(bytes, 1, read))?.page).toBe(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

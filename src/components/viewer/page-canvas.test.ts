import { describe, expect, it } from 'vitest';
import { PageBuffers } from './page-canvas';

interface FakeCanvas {
  style: { opacity: string };
  name: string;
}

function fakeCanvas(name: string): FakeCanvas {
  return { name, style: { opacity: name === 'a' ? '1' : '0' } };
}

function buffersOf(a: FakeCanvas | null, b: FakeCanvas | null): PageBuffers {
  return new PageBuffers(
    { current: a as unknown as HTMLCanvasElement | null },
    { current: b as unknown as HTMLCanvasElement | null }
  );
}

describe('PageBuffers', () => {
  it('draws into the canvas that is NOT on screen', () => {
    const a = fakeCanvas('a');
    const b = fakeCanvas('b');
    const buffers = buffersOf(a, b);

    expect((buffers.front() as unknown as FakeCanvas).name).toBe('a');
    expect((buffers.back() as unknown as FakeCanvas).name).toBe('b');
  });

  it('has painted nothing until the first frame is presented', () => {
    const buffers = buffersOf(fakeCanvas('a'), fakeCanvas('b'));
    expect(buffers.hasPainted()).toBe(false);
    buffers.present();
    expect(buffers.hasPainted()).toBe(true);
  });

  it('swaps the two canvases in one step, so the page is never blank', () => {
    const a = fakeCanvas('a');
    const b = fakeCanvas('b');
    const buffers = buffersOf(a, b);

    expect(buffers.present()).toBe(true);
    expect(b.style.opacity).toBe('1');
    expect(a.style.opacity).toBe('0');
    expect((buffers.front() as unknown as FakeCanvas).name).toBe('b');
    expect((buffers.back() as unknown as FakeCanvas).name).toBe('a');
  });

  it('alternates on every redraw', () => {
    const a = fakeCanvas('a');
    const b = fakeCanvas('b');
    const buffers = buffersOf(a, b);

    buffers.present();
    buffers.present();
    expect(a.style.opacity).toBe('1');
    expect(b.style.opacity).toBe('0');
    expect((buffers.front() as unknown as FakeCanvas).name).toBe('a');
  });

  it('refuses to present when the page has been unmounted', () => {
    const buffers = buffersOf(null, null);
    expect(buffers.present()).toBe(false);
    expect(buffers.hasPainted()).toBe(false);
  });

  it('leaves the old bitmap alone when a render never completes', () => {
    // A cancelled render simply never calls present(): whatever is on screen
    // stays there, which is the whole point of the pair.
    const a = fakeCanvas('a');
    const b = fakeCanvas('b');
    buffersOf(a, b);
    expect(a.style.opacity).toBe('1');
    expect(b.style.opacity).toBe('0');
  });
});

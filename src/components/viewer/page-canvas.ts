/**
 * The per-page double buffer.
 *
 * pdfjs clears a canvas the instant it starts drawing into it, so rendering
 * straight onto the visible canvas blanks the page for as long as the render
 * takes — the half-second of dark an attorney sees after committing a text box,
 * a whiteout, a stamp, or a rotation. Every page therefore carries TWO
 * canvases, stacked: the one on screen keeps the last good bitmap while the
 * other takes the new render, and they change places only once the new bitmap
 * is complete. A render that is cancelled or fails never reaches `present()`,
 * so a failed redraw leaves the page exactly as it was rather than empty.
 *
 * Both canvases are sized by CSS to the page box, so during a zoom the outgoing
 * bitmap is stretched to the new size for the frame or two the new render takes
 * — a scaled preview of the right page, never a hole.
 */

/** The two canvas elements, as React hands them over. */
export type CanvasSource = { readonly current: HTMLCanvasElement | null };

export class PageBuffers {
  readonly #first: CanvasSource;
  readonly #second: CanvasSource;
  #frontIsFirst = true;
  #painted = false;

  constructor(first: CanvasSource, second: CanvasSource) {
    this.#first = first;
    this.#second = second;
  }

  /** The canvas currently on screen. */
  front(): HTMLCanvasElement | null {
    return this.#frontIsFirst ? this.#first.current : this.#second.current;
  }

  /** The canvas the next frame is drawn into, off screen. */
  back(): HTMLCanvasElement | null {
    return this.#frontIsFirst ? this.#second.current : this.#first.current;
  }

  /** False until a frame has been shown — the shimmer is only for that wait. */
  hasPainted(): boolean {
    return this.#painted;
  }

  /**
   * Brings the freshly drawn back canvas forward in one step. False when the
   * page has been unmounted underneath the render, so the caller can stop.
   */
  present(): boolean {
    const back = this.back();
    if (back === null) return false;
    const front = this.front();
    back.style.opacity = '1';
    if (front !== null && front !== back) front.style.opacity = '0';
    this.#frontIsFirst = !this.#frontIsFirst;
    this.#painted = true;
    return true;
  }
}

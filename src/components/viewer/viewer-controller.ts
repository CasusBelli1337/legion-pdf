/**
 * The mutable core behind ViewerApi. It lives outside React state on purpose:
 * page geometry changes on every scroll and zoom, and overlays are registered
 * by panels that must not re-render the whole document to add a mark.
 *
 * The scroller and the search function are attached by the viewer when it
 * mounts; everything degrades to a no-op (never a crash) before that.
 */

import type { PageSize, PdfPoint, TextMatch } from '@shared/types';
import {
  clientToPdfPoint,
  pdfToClientPoint,
  type Box,
  type ClientPoint,
  type PageGeometry,
} from './page-geometry';
import type { PageOverlayRenderer, SearchProgress } from './viewer-types';

export interface OverlayEntry {
  id: string;
  render: PageOverlayRenderer;
}

export type PageScroller = (page: number) => void;
export type DocumentSearch = (query: string, onProgress?: SearchProgress) => Promise<TextMatch[]>;

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export class ViewerController {
  #geometry = new Map<number, PageGeometry>();
  #sizes = new Map<number, PageSize>();
  #overlays: OverlayEntry[] = [];
  #overlayListeners = new Set<() => void>();
  #scroller: PageScroller | null = null;
  #search: DocumentSearch | null = null;

  setGeometry(page: number, geometry: PageGeometry): void {
    this.#geometry.set(page, geometry);
    this.#sizes.set(page, geometry.size);
  }

  clearGeometry(page: number): void {
    this.#geometry.delete(page);
  }

  getGeometry(page: number): PageGeometry | null {
    return this.#geometry.get(page) ?? null;
  }

  /** Page sizes learned in the background, before a page has ever been drawn. */
  setSize(page: number, size: PageSize): void {
    this.#sizes.set(page, size);
  }

  pageSize(page: number): PageSize | null {
    return this.#sizes.get(page) ?? null;
  }

  attachScroller(scroller: PageScroller): () => void {
    this.#scroller = scroller;
    return () => {
      if (this.#scroller === scroller) this.#scroller = null;
    };
  }

  attachSearch(search: DocumentSearch): () => void {
    this.#search = search;
    return () => {
      if (this.#search === search) this.#search = null;
    };
  }

  goToPage(page: number): void {
    this.#scroller?.(page);
  }

  async findText(query: string, onProgress?: SearchProgress): Promise<TextMatch[]> {
    if (this.#search === null) return [];
    return this.#search(query, onProgress);
  }

  registerOverlay(id: string, render: PageOverlayRenderer): () => void {
    this.#overlays = [...this.#overlays.filter((entry) => entry.id !== id), { id, render }];
    this.#notifyOverlays();
    return () => {
      const next = this.#overlays.filter((entry) => entry.id !== id);
      if (next.length === this.#overlays.length) return;
      this.#overlays = next;
      this.#notifyOverlays();
    };
  }

  subscribeOverlays = (listener: () => void): (() => void) => {
    this.#overlayListeners.add(listener);
    return () => this.#overlayListeners.delete(listener);
  };

  /** Stable snapshot: the array identity only changes when overlays change. */
  overlaySnapshot = (): readonly OverlayEntry[] => this.#overlays;

  clientToPdf(page: number, point: ClientPoint): PdfPoint | null {
    const geometry = this.#geometry.get(page);
    if (geometry?.element == null) return null;
    return clientToPdfPoint(geometry.transform, boxOf(geometry.element), point);
  }

  pdfToClient(page: number, point: PdfPoint): ClientPoint | null {
    const geometry = this.#geometry.get(page);
    if (geometry?.element == null) return null;
    return pdfToClientPoint(geometry.transform, boxOf(geometry.element), point);
  }

  /** The page's client box, or null when the page is not currently mounted. */
  pageRect(page: number): Box | null {
    const element = this.#geometry.get(page)?.element;
    return element == null ? null : boxOf(element);
  }

  #notifyOverlays(): void {
    for (const listener of this.#overlayListeners) listener();
  }
}

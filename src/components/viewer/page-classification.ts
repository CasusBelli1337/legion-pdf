/**
 * Text roles, borrowed from the selection-intelligence lane if it is there.
 *
 * The viewer must not depend on that lane existing: `src/features/select-copy`
 * is loaded through `import.meta.glob`, which resolves to nothing at all when
 * the module is absent, so a build without it neither fails nor warns. With no
 * classifier the viewer behaves exactly as it always has — every span is
 * selectable — and with one, line numbers, running heads and Bates stamps stop
 * coming along with a copied paragraph.
 *
 * WHAT THE LANE MUST EXPORT from `src/features/select-copy/index.ts`:
 *   engineForDocument(document, docId) -> {
 *     classifyPage(page): Promise<PageClassification>,
 *     smartText(selection): Promise<string>,
 *   }
 *   (preferred: WeakMap-cached per pdfjs document, so the selection menu and
 *   this hook share one engine) — with createPdfjsSource+createSelectCopyEngine
 *   as the uncached fallback shape.
 * Anything else, or a throw, is read as "no classifier" and never as an error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageClassification } from '../../features/select-copy/contract';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import type { PageRoleMap } from './text-layer-roles';

type ClassifyPage = (page: number) => Promise<PageClassification>;

/** The lane's flowing-prose pass over a live DOM selection. */
export type SmartText = (selection: unknown) => Promise<string>;

interface LaneEngine {
  classifyPage?: ClassifyPage;
  smartText?: SmartText;
}

interface SelectCopyModule {
  engineForDocument?: (document: PDFDocumentProxy, docId: string) => LaneEngine;
  createPdfjsSource?: (document: PDFDocumentProxy, docId: string) => unknown;
  createSelectCopyEngine?: (source: unknown) => LaneEngine;
}

const LANE_PATH = '../../features/select-copy/index.ts';
const LANE = import.meta.glob<SelectCopyModule>('../../features/select-copy/index.ts');

/** The lane's engine for a document, or null when it is absent or unusable. */
async function loadLaneEngine(
  document: PDFDocumentProxy,
  docId: string
): Promise<LaneEngine | null> {
  const load = LANE[LANE_PATH];
  if (load === undefined) return null;
  try {
    const { engineForDocument, createPdfjsSource, createSelectCopyEngine } = await load();
    if (typeof engineForDocument === 'function') return engineForDocument(document, docId);
    if (typeof createPdfjsSource === 'function' && typeof createSelectCopyEngine === 'function') {
      return createSelectCopyEngine(createPdfjsSource(document, docId));
    }
    return null;
  } catch {
    return null;
  }
}

/** The classifier for a document, or null when the lane is absent or unusable. */
export async function loadPageClassifier(
  document: PDFDocumentProxy,
  docId: string
): Promise<ClassifyPage | null> {
  const engine = await loadLaneEngine(document, docId);
  if (engine === null || typeof engine.classifyPage !== 'function') return null;
  return engine.classifyPage.bind(engine);
}

/** The smart-copy pass for a document, or null when the lane cannot supply one. */
export async function loadSmartText(
  document: PDFDocumentProxy,
  docId: string
): Promise<SmartText | null> {
  const engine = await loadLaneEngine(document, docId);
  if (engine === null || typeof engine.smartText !== 'function') return null;
  return engine.smartText.bind(engine);
}

/** Roles keyed by the item index the text layer stamps onto each span. */
export function rolesOf(classification: PageClassification): PageRoleMap {
  return new Map(classification.items.map((item) => [item.itemIndex, item.role]));
}

export interface PageRoles {
  /** Roles for a page, or null while nothing has classified it. */
  rolesFor(page: number): PageRoleMap | null;
  /** Ask for a page; each page calls this as it draws. Safe to call repeatedly. */
  request(page: number): void;
}

const NO_ROLES: PageRoles = { rolesFor: () => null, request: () => undefined };

/**
 * One classifier per open document, with each page classified the first time it
 * is drawn. A failure on one page is silent by design: a missing role map means
 * the old behaviour for that page, never a broken viewer.
 */
export function usePageRoles(document: PDFDocumentProxy | null, docId: string | null): PageRoles {
  const classify = useRef<ClassifyPage | null>(null);
  const roles = useRef(new Map<number, PageRoleMap>());
  const asked = useRef(new Set<number>());
  const [, setLanded] = useState(0);

  useEffect(() => {
    classify.current = null;
    roles.current = new Map();
    asked.current = new Set();
    if (document === null || docId === null) return;
    let cancelled = false;
    void loadPageClassifier(document, docId).then((loaded) => {
      if (cancelled) return;
      classify.current = loaded;
      setLanded((landed) => landed + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [document, docId]);

  const request = useCallback((page: number): void => {
    const run = classify.current;
    if (run === null || asked.current.has(page)) return;
    asked.current.add(page);
    void run(page)
      .then((classification) => {
        roles.current.set(page, rolesOf(classification));
        setLanded((landed) => landed + 1);
      })
      .catch(() => asked.current.delete(page));
  }, []);

  const rolesFor = useCallback(
    (page: number): PageRoleMap | null => {
      request(page);
      return roles.current.get(page) ?? null;
    },
    [request]
  );

  return document === null ? NO_ROLES : { rolesFor, request };
}

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
 *   engineForDocument(document, docId) -> { classifyPage(page): Promise<PageClassification> }
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

interface SelectCopyModule {
  engineForDocument?: (
    document: PDFDocumentProxy,
    docId: string
  ) => { classifyPage?: ClassifyPage };
  createPdfjsSource?: (document: PDFDocumentProxy, docId: string) => unknown;
  createSelectCopyEngine?: (source: unknown) => { classifyPage?: ClassifyPage };
}

const LANE_PATH = '../../features/select-copy/index.ts';
const LANE = import.meta.glob<SelectCopyModule>('../../features/select-copy/index.ts');

/** The classifier for a document, or null when the lane is absent or unusable. */
export async function loadPageClassifier(
  document: PDFDocumentProxy,
  docId: string
): Promise<ClassifyPage | null> {
  const load = LANE[LANE_PATH];
  if (load === undefined) return null;
  try {
    const module = await load();
    const { engineForDocument, createPdfjsSource, createSelectCopyEngine } = module;
    const engine =
      typeof engineForDocument === 'function'
        ? engineForDocument(document, docId)
        : typeof createPdfjsSource === 'function' && typeof createSelectCopyEngine === 'function'
          ? createSelectCopyEngine(createPdfjsSource(document, docId))
          : null;
    if (engine === null) return null;
    return typeof engine.classifyPage === 'function' ? engine.classifyPage.bind(engine) : null;
  } catch {
    return null;
  }
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

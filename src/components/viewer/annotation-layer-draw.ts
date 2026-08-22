/**
 * One page's interactive form widgets: the pdfjs AnnotationLayer with
 * renderForms on, drawn above the text layer. Only Widget annotations are
 * handed to it — links, popups and the rest of the annotation zoo stay out of
 * the viewer's behaviour. The canvas render (ENABLE_FORMS) leaves widget
 * appearances off the bitmap, so the HTML input here is each field's single
 * painter; checkbox/radio state appearances arrive through the shared
 * annotationCanvasMap the canvas render filled.
 */

import { AnnotationLayer } from '../../lib/pdfjs';
import type { PDFDocumentProxy } from '../../lib/pdfjs';
import { formSessionFor, syncStorageIntoStore } from '../../features/forms/form-session';

type PageProxy = Awaited<ReturnType<PDFDocumentProxy['getPage']>>;
type PageViewport = ReturnType<PageProxy['getViewport']>;
type LayerParameters = Parameters<AnnotationLayer['render']>[0];

/** pdf.js LinkTarget.BLANK — push-button links open outside the app. */
const LINK_TARGET_BLANK = 2;

/**
 * The slice of pdf.js's link-service interface that Widget annotations can
 * reach. Document navigation is a no-op; external URLs get target=_blank and
 * land in the main process's window-open guard like every other link.
 */
class WidgetLinkService {
  externalLinkEnabled = true;
  externalLinkTarget = LINK_TARGET_BLANK;
  externalLinkRel = 'noopener noreferrer nofollow';
  isInPresentationMode = false;
  page = 1;
  rotation = 0;
  getDestinationHash(): string {
    return '#';
  }
  getAnchorUrl(): string {
    return '#';
  }
  goToDestination(): Promise<void> {
    return Promise.resolve();
  }
  goToPage(): void {}
  setHash(): void {}
  executeNamedAction(): void {}
  executeSetOCGState(): void {}
}

export interface AnnotationDrawTarget {
  container: HTMLDivElement;
  document: PDFDocumentProxy;
  docId: string;
  pdfPage: PageProxy;
  viewport: PageViewport;
  zoom: number;
  /** Filled by the page's canvas render; carries checkbox/radio appearances. */
  canvasMap: Map<string, HTMLCanvasElement>;
}

/** The latest sync closure per container; the one listener relays to it. */
const syncHandlers = new WeakMap<HTMLElement, () => void>();

function ensureSyncListener(container: HTMLDivElement): void {
  if (container.dataset['formSync'] === 'on') return;
  container.dataset['formSync'] = 'on';
  const relay = (): void => syncHandlers.get(container)?.();
  container.addEventListener('input', relay);
  container.addEventListener('change', relay);
}

/** Draw the page's widgets. Resolves false when the page has none. */
export async function drawAnnotationLayer(target: AnnotationDrawTarget): Promise<boolean> {
  const { container, document, docId, pdfPage, zoom } = target;
  const annotations = (await pdfPage.getAnnotations()) as Array<{ subtype?: string }>;
  const widgets = annotations.filter((annotation) => annotation.subtype === 'Widget');
  container.replaceChildren();
  if (widgets.length === 0) return false;

  const session = await formSessionFor(document, docId);
  // pdfjs sizes the layer div itself with calc(var(--scale-factor) * ...) and
  // its inputs with --total-scale-factor; the host supplies both, or the
  // whole layer collapses to zero size at the page corner.
  container.style.setProperty('--scale-factor', String(zoom));
  container.style.setProperty('--total-scale-factor', String(zoom));
  const linkService = new WidgetLinkService();
  const viewport = target.viewport.clone({ dontFlip: true });
  const layer = new AnnotationLayer({
    div: container,
    accessibilityManager: null,
    annotationCanvasMap: target.canvasMap,
    annotationEditorUIManager: null,
    page: pdfPage,
    viewport,
    structTreeLayer: null,
    commentManager: null,
    linkService,
    annotationStorage: document.annotationStorage,
  });
  // The cast bridges our minimal link service to pdf.js's full class type;
  // the layer only calls the methods widgets reach, all of which exist above.
  await layer.render({
    annotations: widgets,
    div: container,
    viewport,
    page: pdfPage,
    linkService,
    annotationStorage: document.annotationStorage,
    renderForms: true,
  } as unknown as LayerParameters);

  syncHandlers.set(container, () => syncStorageIntoStore(session, document, docId));
  ensureSyncListener(container);
  return true;
}

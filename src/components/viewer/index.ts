/**
 * The viewer lane's public surface. Everything other lanes are allowed to use
 * is exported here — import from `components/viewer`, never from a file inside.
 */

export { PdfViewer } from './pdf-viewer';
export { ViewerApiProvider } from './viewer-api';
export { useViewerApi, useViewerController } from './viewer-context';
export { finishPrint, preparePrint } from './print-controller';
export { forgetTabView } from './tab-view-state';
export { usePdfDocument, acquireDocument, releaseDocument } from './pdf-document-cache';
export type {
  Box,
  ClientPoint,
  PageOverlayContext,
  PageOverlayRenderer,
  SearchProgress,
  ViewerApi,
} from './viewer-types';
export type { PageGeometry, TransformMatrix } from './page-geometry';

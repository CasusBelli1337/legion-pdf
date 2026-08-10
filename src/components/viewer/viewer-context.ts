/**
 * The viewer's two React contexts and the hooks that read them. They live apart
 * from the provider component on purpose: a file that exports both components
 * and plain functions cannot fast-refresh, so the provider file exports the
 * component and nothing else.
 */

import { createContext, useContext } from 'react';
import type { ViewerController } from './viewer-controller';
import type { ViewerApi } from './viewer-types';

export const ViewerApiContext = createContext<ViewerApi | null>(null);
export const ViewerControllerContext = createContext<ViewerController | null>(null);

/** The viewer contract, or null when no document is open. */
export function useViewerApi(): ViewerApi | null {
  return useContext(ViewerApiContext);
}

/** Viewer-internal: the mutable controller the provider owns. */
export function useViewerController(): ViewerController {
  const controller = useContext(ViewerControllerContext);
  if (controller === null) {
    throw new Error('The viewer must be rendered inside a ViewerApiProvider.');
  }
  return controller;
}

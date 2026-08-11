/**
 * The shell: tabs, tool dock, viewer, thumbnail rail, status footer.
 *
 * Acrobat's arrangement, because that is the muscle memory an attorney brings:
 * tools on the LEFT, the document in the middle, pages and bookmarks on the
 * RIGHT. The native menu bar is hidden (electron/main.ts) and its actions live
 * on the viewer's toolbar, so there is exactly one chrome row above the
 * document and the status footer below it.
 */

import { useEffect } from 'react';
import { DocumentRail } from '../components/thumbnails';
import { ViewerApiProvider } from '../components/viewer';
import { registerRasterResponder } from '../lib/rasterize';
import { closeDocument, openDialog, openPaths } from './document-actions';
import { runMenuAction } from './menu-actions';
import { getSessionBytes } from './store';
import { StatusFooter } from './shell/status-footer';
import { TabBar } from './shell/tab-bar';
import { ToolDock } from './shell/tool-dock';
import { ViewerSlot } from './shell/viewer-slot';

function useShellWiring(): void {
  useEffect(() => registerRasterResponder(getSessionBytes), []);
  useEffect(() => window.librarius.app.onMenuAction(runMenuAction), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openDialog();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export function App() {
  useShellWiring();

  return (
    <div className="flex h-full flex-col bg-armory-base text-text-primary">
      <TabBar onClose={(docId) => void closeDocument(docId)} />
      <ViewerApiProvider>
        <div className="flex min-h-0 flex-1">
          <ToolDock />
          <ViewerSlot onOpenPaths={(paths) => void openPaths(paths)} />
          <DocumentRail />
        </div>
      </ViewerApiProvider>
      <StatusFooter />
    </div>
  );
}

/**
 * The shell: top bar, tabs, thumbnail rail, viewer, tool dock, status footer.
 * Feature lanes fill the slots; the shell itself owns only wiring.
 */

import { useEffect } from 'react';
import { registerRasterResponder } from '../lib/rasterize';
import { closeDocument, openDialog, openPaths, printActive, saveActive } from './document-actions';
import { runMenuAction } from './menu-actions';
import { getSessionBytes } from './store';
import { RightDock } from './shell/right-dock';
import { StatusFooter } from './shell/status-footer';
import { TabBar } from './shell/tab-bar';
import { ThumbnailRail } from './shell/thumbnail-rail';
import { TopBar } from './shell/top-bar';
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
      <TopBar
        onOpen={() => void openDialog()}
        onSave={() => void saveActive()}
        onPrint={() => void printActive()}
      />
      <TabBar onClose={(docId) => void closeDocument(docId)} />
      <div className="flex min-h-0 flex-1">
        <ThumbnailRail />
        <ViewerSlot onOpenPaths={(paths) => void openPaths(paths)} />
        <RightDock />
      </div>
      <StatusFooter />
    </div>
  );
}

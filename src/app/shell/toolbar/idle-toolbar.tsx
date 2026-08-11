/**
 * The chrome row with no document open. Same height and surface as the viewer's
 * toolbar, so opening a PDF fills the bar in rather than moving it.
 */

import { BusyIndicator } from './busy-indicator';
import { FileActions } from './file-actions';
import { ThemeToggle } from './theme-toggle';
import { TOOLBAR_ROW, TOOLBAR_TRAILING } from './toolbar-classes';

export function IdleToolbar() {
  return (
    <div className={TOOLBAR_ROW}>
      <FileActions />
      <div className={TOOLBAR_TRAILING}>
        <BusyIndicator />
        <ThemeToggle />
      </div>
    </div>
  );
}

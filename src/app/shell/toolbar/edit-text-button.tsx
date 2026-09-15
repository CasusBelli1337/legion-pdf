/**
 * Edit text, on the toolbar where an attorney will find it — not three
 * clicks deep in a dock panel. Pressing it opens Stamps & Marks on its Text tab
 * with the Edit tool armed; pressing it again puts the tool away. Its pressed
 * state follows the tool however it was armed (this button, the panel's own
 * button, or the Edit menu).
 */

import { TextCursorInput } from 'lucide-react';
import { requestTextTool, usePanelRequest } from '@renderer/features/stamps/panel-request';
import { useActiveSession } from '../../store';
import { TOOLBAR_BUTTON } from './toolbar-classes';

export function EditTextButton() {
  const hasDocument = useActiveSession() !== null;
  const isArmed = usePanelRequest((state) => state.armed === 'edit');
  return (
    <button
      type="button"
      className={`${TOOLBAR_BUTTON} ${isArmed ? 'bg-armory-interactive text-brand-400' : ''}`}
      disabled={!hasDocument}
      onClick={() => requestTextTool('edit')}
      aria-label="Edit text"
      aria-pressed={isArmed}
      title="Edit text — click a paragraph on the page to change its words (Ctrl+E)"
    >
      <TextCursorInput size={14} aria-hidden />
    </button>
  );
}

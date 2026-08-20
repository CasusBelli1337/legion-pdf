import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentSession } from '@shared/types';
import { useAppStore } from './store';

/**
 * F-6 (carried from v0.2). `STAMPED ASHFORDQA000001 THROUGH ASHFORDQA000500 ON
 * 500 PAGES` was still sitting in the footer while a completely different
 * document was on screen, several operations later. A receipt belongs to the
 * document that earned it; an app-wide line (the version readout, a file that
 * would not open) belongs to no document and has to survive a tab switch.
 */

function session(id: string): DocumentSession {
  return {
    id,
    filePath: `C:\\Matters\\${id}.pdf`,
    fileName: `${id}.pdf`,
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 2,
    dirty: false,
  };
}

function twoOpenDocuments(): void {
  useAppStore.setState({
    sessions: [session('doc-1'), session('doc-2')],
    activeId: 'doc-1',
    notice: null,
    noticeDocId: null,
    error: null,
    errorDocId: null,
  });
}

beforeEach(twoOpenDocuments);

describe('who a footer message belongs to', () => {
  it('gives an unscoped notice to the document in front', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.');

    expect(useAppStore.getState().noticeDocId).toBe('doc-1');
  });

  it('lets a caller name the document, for an op that finished in the background', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.', 'doc-2');

    expect(useAppStore.getState().noticeDocId).toBe('doc-2');
  });

  it('takes an explicit null as "this is about the app"', () => {
    useAppStore.getState().setNotice('Legion PDF 0.1.0 - Electron 43.3.0', null);

    expect(useAppStore.getState().noticeDocId).toBeNull();
  });

  it('forgets the owner when the message is cleared', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.');
    useAppStore.getState().setNotice(null);

    expect(useAppStore.getState().noticeDocId).toBeNull();
  });
});

describe('switching to another document', () => {
  it('drops the receipt the document being left behind earned', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.');
    useAppStore.getState().setActive('doc-2');

    expect(useAppStore.getState().notice).toBeNull();
    expect(useAppStore.getState().noticeDocId).toBeNull();
  });

  it('drops that document error too', () => {
    useAppStore.getState().setError('Could not save: the file is read-only.');
    useAppStore.getState().setActive('doc-2');

    expect(useAppStore.getState().error).toBeNull();
  });

  it('keeps an app-wide line, which was never about either document', () => {
    useAppStore.getState().setNotice('Legion PDF 0.1.0 - Electron 43.3.0', null);
    useAppStore.getState().setActive('doc-2');

    expect(useAppStore.getState().notice).toBe('Legion PDF 0.1.0 - Electron 43.3.0');
  });

  it('keeps the receipt when the same document is re-selected', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.');
    useAppStore.getState().setActive('doc-1');

    expect(useAppStore.getState().notice).toBe('Stamped 500 pages.');
  });
});

describe('opening and closing documents', () => {
  it('drops another document receipt when a new file is opened', () => {
    useAppStore.getState().setNotice('Stamped 500 pages.');
    useAppStore.getState().openSession(session('doc-3'));

    expect(useAppStore.getState().notice).toBeNull();
  });

  it('drops the receipt of the document that just closed', () => {
    useAppStore.getState().setNotice('Turned 1 page clockwise.');
    useAppStore.getState().closeSession('doc-1');

    expect(useAppStore.getState().activeId).toBe('doc-2');
    expect(useAppStore.getState().notice).toBeNull();
  });

  it('leaves the receipt of a document that is still in front', () => {
    useAppStore.getState().setNotice('Turned 1 page clockwise.');
    useAppStore.getState().closeSession('doc-2');

    expect(useAppStore.getState().notice).toBe('Turned 1 page clockwise.');
  });
});

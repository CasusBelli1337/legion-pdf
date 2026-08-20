/**
 * One engine per open document, built from the same shared pdfjs document the
 * viewer, the thumbnails, and find already hold — `acquireDocument` refcounts
 * it, so classifying a page costs no second parse of the file.
 *
 * The engine is rebuilt when the bytes change, because an op that stamps or
 * redacts the file produces genuinely different text: a classification cached
 * against the old bytes would cite the wrong line. The built engine is stamped
 * with the bytes it was built from, and anything else reads as "not ready yet"
 * — which is what keeps the previous document's engine off the new document.
 *
 * The document cache is imported as the LEAF file rather than through
 * `components/viewer`, for the same reason `register-menu.ts` imports the slot
 * directly: the viewer's public surface pulls in `PdfViewer`, and the viewer
 * lazily imports this lane back, so going through the index would couple the
 * two into a loop over a refcount this file is the only user of.
 */

import { useEffect, useState } from 'react';
import { acquireDocument, releaseDocument } from '../../components/viewer/pdf-document-cache';
import { useActiveSession } from '../../app/store';
import { readCitePrefix } from './cite-prefix';
import { engineForDocument } from './engine-cache';
import type { SelectCopyEngineHandle } from './engine';

interface Built {
  bytes: Uint8Array;
  engine: SelectCopyEngineHandle | null;
}

export function useSelectCopyEngine(): SelectCopyEngineHandle | null {
  const session = useActiveSession();
  const bytes = session?.bytes ?? null;
  const docId = session?.id ?? null;
  const filePath = session?.filePath ?? null;
  const [built, setBuilt] = useState<Built | null>(null);

  useEffect(() => {
    if (bytes === null || docId === null) return;
    let cancelled = false;

    acquireDocument(bytes)
      .then((document) => {
        if (cancelled) return;
        const engine = engineForDocument(document, docId);
        engine.setCitePrefix(readCitePrefix({ docId, filePath }));
        setBuilt({ bytes, engine });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBuilt({ bytes, engine: null });
        console.error('Selection intelligence could not read this document.', error);
      });

    return () => {
      cancelled = true;
      releaseDocument(bytes);
    };
  }, [bytes, docId, filePath]);

  return built !== null && built.bytes === bytes ? built.engine : null;
}

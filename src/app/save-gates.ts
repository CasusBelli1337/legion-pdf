/**
 * Everything that has to be settled BEFORE a document is written to disk.
 *
 * Two lanes now hold work that lives in the renderer and is not in the file
 * yet — placed signatures and redaction marks — and each has a point of no
 * return the attorney must agree to. Every save path runs the same gates in the
 * same order through this one function, so a new save entry point cannot
 * accidentally skip one (that is exactly how a "signed" file ships unsigned, or
 * a marked file ships unredacted).
 *
 * Order matters: signatures first. Flattening a signature changes the bytes the
 * redaction would then destroy from, so asking about redaction first could
 * redact a document that is about to gain a signature.
 *
 * Returning false means DO NOT SAVE — the attorney backed out, a step failed,
 * or (in the redaction case) the redacted copy has already been saved in this
 * save's place and writing the source on top of it would be a lie.
 */

// Imported from the modules rather than the feature barrels so a save never
// pulls a tool panel's React tree in behind it.
import { flattenSignaturesFor } from '../features/signature/save-flattening';
import { hasPendingMarks } from '../features/redact/redaction-store';
import { useAppStore } from './store';

/** A gate that cannot be asked is never taken as permission to save. */
async function redactionGate(docId: string): Promise<boolean> {
  try {
    // Loaded only when there is something to ask about: the gate reaches pdfjs
    // and React DOM, and the ordinary save — which every document takes — must
    // not drag either one in behind it.
    const gate = await import('../features/redact/save-redaction-gate');
    return await gate.redactionGateFor(docId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    useAppStore
      .getState()
      .setError(
        `Could not ask about this document's redaction marks, so nothing was saved. ${reason}`
      );
    return false;
  }
}

export async function runSaveGates(docId: string): Promise<boolean> {
  if (!(await flattenSignaturesFor(docId))) return false;
  if (!hasPendingMarks(docId)) return true;
  return redactionGate(docId);
}

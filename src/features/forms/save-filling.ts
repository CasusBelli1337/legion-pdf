/**
 * The moment typed form answers become part of the file: saving (or printing).
 *
 * Unlike signature flattening this is not a point of no return — a committed
 * field is still a field, editable tomorrow — so no confirmation is raised.
 * The commit is all-or-nothing in core (every value lands or the op throws),
 * and a failure stops the save: writing the file WITHOUT the answers the
 * attorney can see on screen is exactly the silent loss this app refuses.
 */

import { useAppStore } from '@renderer/app/store';
import { editsFor, useFormStore } from './form-store';

/** True when the save may proceed; false stopped it. */
export async function commitFormValuesFor(docId: string): Promise<boolean> {
  const edits = editsFor(docId);
  const names = Object.keys(edits);
  if (names.length === 0) return true;

  const store = useAppStore.getState();
  const plural = names.length === 1 ? 'answer' : 'answers';
  store.setBusy(`Writing ${names.length} form ${plural} into the document`);
  try {
    const values = names.map((name) => {
      const value = edits[name];
      return { name, value: value ?? '' };
    });
    await window.librarius.ops.fillForm(docId, { values });
    useFormStore.getState().clearDocument(docId);
    store.replaceSession(await window.librarius.file.read(docId));
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    store.setError(
      `The form answers could not be written into the document, so nothing was saved. ${reason}`
    );
    return false;
  } finally {
    store.setBusy(null);
  }
}

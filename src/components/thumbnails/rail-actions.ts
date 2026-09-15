/**
 * The work behind each right-click menu item, one entry per action. Config over
 * code: the menu component never grows a switch, and the compiler fails the
 * build if an action in rail-menu.ts arrives without an operation here.
 *
 * Every entry reuses the Organize lane's actions, so a page deleted from the
 * rail and a page deleted from the Organize panel produce the same receipt
 * sentence in the footer and go through the same validated bridge call.
 */

import { deletePages, extractPages, rotatePages } from '../../features/organize/organize-actions';
import type { RailMenuAction } from './rail-menu';

/** The menu actions that change the document; the other two are local. */
export type RailOpAction = Exclude<RailMenuAction, 'go-to' | 'select-all'>;

export interface RailOp {
  /** Present tense, shown while it runs: "Removing pages". */
  label: string;
  /**
   * Whether the page numbers move under the selection. After a delete, page 4
   * is a different page than it was, so holding the old selection would aim the
   * next operation at content the attorney never chose.
   */
  clearsSelection: boolean;
  /** Resolves to the receipt sentence the footer shows afterwards. */
  work(): Promise<string>;
}

type RailOpFactory = (docId: string, pages: number[]) => RailOp;

export const RAIL_OPS: Record<RailOpAction, RailOpFactory> = {
  delete: (docId, pages) => ({
    label: 'Removing pages',
    clearsSelection: true,
    work: () => deletePages(docId, pages),
  }),
  extract: (docId, pages) => ({
    label: 'Copying pages to a new PDF',
    clearsSelection: false,
    work: () => extractPages(docId, pages, false),
  }),
  'extract-remove': (docId, pages) => ({
    label: 'Moving pages to a new PDF',
    clearsSelection: true,
    work: () => extractPages(docId, pages, true),
  }),
  'rotate-cw': (docId, pages) => ({
    label: 'Turning pages',
    clearsSelection: false,
    work: () => rotatePages(docId, pages, 'clockwise'),
  }),
  'rotate-ccw': (docId, pages) => ({
    label: 'Turning pages',
    clearsSelection: false,
    work: () => rotatePages(docId, pages, 'counter-clockwise'),
  }),
};

export function isRailOp(action: RailMenuAction): action is RailOpAction {
  return action !== 'go-to' && action !== 'select-all';
}

/**
 * What a tagged PDF says about its own paragraphs. Word and Acrobat write a
 * structure tree — P, H1, LI, TD, Caption, TOCI… — whose leaves are the
 * marked-content sequences of the page, and every text item sits inside one.
 * Where the tree exists it is the truth about where a paragraph starts and
 * ends, better than any guess from line geometry; where it does not (scans,
 * Distiller, most court e-filing stamps) the heuristics take over.
 */

import type { LayoutBlockRole } from '@shared/types';

export interface StructNodeLike {
  role?: string;
  type?: string;
  id?: string;
  children?: StructNodeLike[];
}

export interface MarkedItemLike {
  type?: string;
  id?: string;
  tag?: string;
  str?: string;
}

export interface BlockRef {
  id: string;
  role: LayoutBlockRole;
}

/** Structure types that hold a paragraph's worth of text, and what they are for. */
const BLOCK_ROLES: Record<string, LayoutBlockRole> = {
  P: 'paragraph',
  H: 'heading',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  Title: 'heading',
  LI: 'list-item',
  LBody: 'list-item',
  Lbl: 'list-item',
  TD: 'cell',
  TH: 'cell',
  Caption: 'caption',
  TOCI: 'toc-entry',
  Note: 'note',
  BlockQuote: 'quote',
  Code: 'paragraph',
  Formula: 'paragraph',
};

/** The cell-level ancestor a block sits in, when the block is inside a table. */
const CELL_ROLES = new Set(['TD', 'TH']);

/** Marked-content id → the block that owns it, from the page's structure tree. */
export function blocksOf(tree: StructNodeLike | null | undefined): Map<string, BlockRef> {
  const blocks = new Map<string, BlockRef>();
  let counter = 0;
  const walk = (node: StructNodeLike, block: BlockRef | null, cell: string | null): void => {
    if (node.type === 'content') {
      if (node.id !== undefined && block !== null) blocks.set(node.id, inCell(block, cell));
      return;
    }
    counter += 1;
    const role = BLOCK_ROLES[node.role ?? ''];
    const own = role === undefined ? block : { id: `b${counter}`, role };
    const ownCell = CELL_ROLES.has(node.role ?? '') ? `c${counter}` : cell;
    for (const child of node.children ?? []) walk(child, own, ownCell);
  };
  if (tree) walk(tree, null, null);
  return blocks;
}

/** A block inside a table cell carries the cell in its id: "c12/b13". */
function inCell(block: BlockRef, cell: string | null): BlockRef {
  return cell === null ? block : { ...block, id: `${cell}/${block.id}` };
}

/**
 * The block of every TEXT item, in text-item order, from a text content read
 * with marked content included — the same text items, in the same order, as
 * a plain read, with the begin/end markers interleaved.
 */
export function blockOfEachText(
  items: readonly MarkedItemLike[],
  blocks: ReadonlyMap<string, BlockRef>
): (BlockRef | undefined)[] {
  const stack: (string | undefined)[] = [];
  const out: (BlockRef | undefined)[] = [];
  for (const item of items) {
    if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') {
      stack.push(item.id);
    } else if (item.type === 'endMarkedContent') {
      stack.pop();
    } else if (item.type === undefined) {
      const id = [...stack].reverse().find((entry) => entry !== undefined);
      out.push(id === undefined ? undefined : blocks.get(id));
    }
  }
  return out;
}

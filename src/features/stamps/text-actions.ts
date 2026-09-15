/**
 * The Text and Cover tools' state and operations, in one place, so the panel
 * stays a set of buttons and the overlay stays a renderer.
 *
 * Which box is being typed in is DERIVED from the placement, never mirrored
 * into another piece of state: a drag that produced a big enough box IS an open
 * editor. The one exception is cover-and-retype, where the box outlives the
 * placement that produced it because the cover op clears the placement on its
 * way through.
 *
 * COVERING IS TYPING OVER. Letting go of a cover drag runs the whiteout and
 * opens the editor in the same motion — there is no second screen asking which
 * kind of cover this is. Committing nothing leaves a plain white patch, which
 * is the old "just cover it" outcome, reached by typing nothing instead of by
 * choosing a mode.
 *
 * Cover-then-retype stays two calls, not one clever one: each proves its own
 * page count on the main side before the next begins, so a failure halfway
 * leaves a document that is exactly one verified step further on.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentSession, PdfPoint, PdfRect, TextBoxOptions } from '@shared/types';
import {
  DEFAULT_DRAFT,
  isTypeable,
  sampleFontNear,
  toWhiteoutRect,
  useBlockEditing,
  type BlockEditing,
  type SampledFont,
  type TextDraft,
} from '@renderer/features/text';
import {
  usePlacement,
  type PlacedPoint,
  type PlacedRect,
  type Placement,
  type PlacementMode,
} from './use-placement';
import type { StampRunner } from './use-stamp-runner';

/**
 * Off, drawing a box to type in, drawing a box to cover and type over, or
 * clicking a paragraph to edit the words it already has.
 */
export type TextTool = 'off' | 'text' | 'cover' | 'edit';

const PLACEMENT_FOR: Record<TextTool, PlacementMode> = {
  off: 'off',
  text: 'rect',
  cover: 'rect',
  edit: 'point',
};

interface TextOps {
  cover(area: PlacedRect): Promise<void>;
  commit(options: TextBoxOptions, draft: TextDraft): Promise<boolean>;
}

interface OpOutcome {
  covered(area: PlacedRect): void;
  failed(): void;
  committed(draft: TextDraft): void;
}

function useTextOps(session: DocumentSession, runner: StampRunner, outcome: OpOutcome): TextOps {
  const cover = async (area: PlacedRect): Promise<void> => {
    let landed = false;
    await runner.run('Covering the area to type over', async () => {
      await window.librarius.stamp.whiteout(session.id, {
        page: area.page,
        rect: toWhiteoutRect(area.rect),
        // The whole point of the new flow: the words under the box stop
        // existing, so they cannot be copied, extracted, or read by Centurion.
        removeCoveredText: true,
      });
      landed = true;
      return `Covered an area on page ${area.page} and removed the text under it. Now type over it.`;
    });
    if (landed) outcome.covered(area);
    else outcome.failed();
  };

  const commit = async (options: TextBoxOptions, draft: TextDraft): Promise<boolean> => {
    let landed = false;
    await runner.run('Adding the text', async () => {
      await window.librarius.stamp.textBox(session.id, options);
      landed = true;
      return `Added text to page ${options.page}. Save the document to keep it.`;
    });
    if (landed) outcome.committed(draft);
    return landed;
  };

  return { cover, commit };
}

export interface TextEditing {
  commit(options: TextBoxOptions, draft: TextDraft): Promise<boolean>;
  tool: TextTool;
  arm(tool: TextTool): void;
  placement: Placement;
  /** What the page overlay should be catching right now. */
  mode: PlacementMode;
  /** The box being typed in, or null when nothing is being typed. */
  editing: PlacedRect | null;
  /** The last committed look, so a font choice survives into the next box. */
  seed: TextDraft;
  cancel(): void;
  sampleFont(page: number, rect: PdfRect): Promise<SampledFont | null>;
  /** The paragraph of existing text being edited, when the Edit tool is in use. */
  blockEditing: BlockEditing;
}

/** Fires `cover` once for each finished cover drag, and never during a render. */
function useAutoCover(area: PlacedRect | null, cover: (area: PlacedRect) => Promise<void>): void {
  const latest = useRef(cover);
  useEffect(() => {
    latest.current = cover;
  });
  useEffect(() => {
    if (area !== null) void latest.current(area);
  }, [area]);
}

/** Opens the clicked paragraph once per click, and never during a render. */
function useOpenOnClick(
  point: PlacedPoint | null,
  open: (page: number, at: PdfPoint) => Promise<void>,
  clear: () => void
): void {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(() => {
    if (point === null) return;
    clear();
    void latest.current(point.page, point.at);
  }, [point, clear]);
}

export function useTextEditing(session: DocumentSession, runner: StampRunner): TextEditing {
  const [tool, setTool] = useState<TextTool>('off');
  const [seed, setSeed] = useState<TextDraft>(DEFAULT_DRAFT);
  const [retyping, setRetyping] = useState<PlacedRect | null>(null);
  const placement = usePlacement(PLACEMENT_FOR[tool]);
  const { clear } = placement;
  const blockEditing = useBlockEditing(session, runner);

  const drawn = placement.rect;
  const editing =
    retyping ?? (tool === 'text' && drawn !== null && isTypeable(drawn.rect) ? drawn : null);

  const cancel = useCallback((): void => {
    setRetyping(null);
    clear();
  }, [clear]);

  const ops = useTextOps(session, runner, {
    covered: (area) => {
      clear();
      setTool('off');
      setRetyping(area);
    },
    // A refused cover (text inside a reusable graphic, say) must not leave the
    // drag parked, or the effect below would run it again on the next render.
    failed: () => clear(),
    committed: (draft) => {
      setSeed({ ...draft, text: '' });
      cancel();
    },
  });

  useAutoCover(tool === 'cover' ? drawn : null, ops.cover);
  useOpenOnClick(tool === 'edit' ? placement.point : null, blockEditing.open, clear);

  const busyEditing = editing !== null || blockEditing.block !== null;
  return {
    commit: ops.commit,
    tool,
    placement,
    seed,
    cancel,
    editing,
    mode: busyEditing ? 'off' : PLACEMENT_FOR[tool],
    arm: (next) => {
      setRetyping(null);
      blockEditing.cancel();
      clear();
      setTool((current) => (current === next ? 'off' : next));
    },
    sampleFont: (page, rect) => sampleFontNear(session.bytes, page, rect),
    blockEditing,
  };
}

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
 * Cover-then-retype stays two calls, not one clever one: each proves its own
 * page count on the main side before the next begins, so a failure halfway
 * leaves a document that is exactly one verified step further on.
 */

import { useCallback, useState } from 'react';
import type { DocumentSession, PdfRect, TextBoxOptions } from '@shared/types';
import {
  DEFAULT_DRAFT,
  isTypeable,
  sampleFontNear,
  toWhiteoutRect,
  type SampledFont,
  type TextDraft,
} from '@renderer/features/text';
import { usePlacement, type PlacedRect, type Placement, type PlacementMode } from './use-placement';
import type { StampRunner } from './use-stamp-runner';

/** Off, drawing a box to type in, or drawing a box to cover. */
export type TextTool = 'off' | 'text' | 'cover';

interface TextOps {
  cover(retype: boolean): void;
  commit(options: TextBoxOptions, draft: TextDraft): Promise<boolean>;
}

interface OpOutcome {
  covered(area: PlacedRect, retype: boolean): void;
  committed(draft: TextDraft): void;
}

function useTextOps(
  session: DocumentSession,
  runner: StampRunner,
  placement: Placement,
  outcome: OpOutcome
): TextOps {
  const cover = (retype: boolean): void => {
    const area = placement.rect;
    if (area === null) return;
    void runner
      .run(retype ? 'Covering the area to type over' : 'Covering the area', async () => {
        await window.librarius.stamp.whiteout(session.id, {
          page: area.page,
          rect: toWhiteoutRect(area.rect),
        });
        const next = retype ? 'Now type over it.' : 'Save the document to keep it.';
        return `Covered an area on page ${area.page}. ${next}`;
      })
      .then(() => outcome.covered(area, retype));
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

export interface TextEditing extends TextOps {
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
}

export function useTextEditing(session: DocumentSession, runner: StampRunner): TextEditing {
  const [tool, setTool] = useState<TextTool>('off');
  const [seed, setSeed] = useState<TextDraft>(DEFAULT_DRAFT);
  const [retyping, setRetyping] = useState<PlacedRect | null>(null);
  const placement = usePlacement(tool === 'off' ? 'off' : 'rect');
  const { clear } = placement;

  const drawn = placement.rect;
  const editing =
    retyping ?? (tool === 'text' && drawn !== null && isTypeable(drawn.rect) ? drawn : null);

  const cancel = useCallback((): void => {
    setRetyping(null);
    clear();
  }, [clear]);

  const ops = useTextOps(session, runner, placement, {
    covered: (area, retype) => {
      clear();
      if (!retype) return;
      setTool('off');
      setRetyping(area);
    },
    committed: (draft) => {
      setSeed({ ...draft, text: '' });
      cancel();
    },
  });

  return {
    ...ops,
    tool,
    placement,
    seed,
    cancel,
    editing,
    mode: tool === 'off' || editing !== null ? 'off' : 'rect',
    arm: (next) => {
      setRetyping(null);
      clear();
      setTool((current) => (current === next ? 'off' : next));
    },
    sampleFont: (page, rect) => sampleFontNear(session.bytes, page, rect),
  };
}

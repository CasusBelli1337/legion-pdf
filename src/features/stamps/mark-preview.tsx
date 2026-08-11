/**
 * What a stamp will look like, drawn over the real page before anything is
 * applied. Marks are positioned in the overlay's own box, which IS the page as
 * displayed — so a corner is the corner the attorney sees, on a rotated page
 * as much as an upright one, with no coordinate arithmetic to get wrong.
 *
 * These are previews: the browser measures the text, pdf-lib measures it again
 * when the stamp is applied, and the two agree to within a hair. The purple
 * dashed outline is the tell that nothing has been written to the file yet.
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Alignment, Corner, PdfPoint, PdfRect } from '@shared/types';
import type { PageOverlayContext } from '@renderer/components/viewer';

/** The screen stand-in for the PDF base fonts the stamps are drawn in. */
const PREVIEW_FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";
const PENDING_OUTLINE = 'outline outline-1 outline-dashed outline-purple-400/70';

export interface MarkText {
  text: string;
  /** Font size in PDF points; scaled to the screen here. */
  fontSize: number;
  /** CSS colour. Defaults to near-black, the colour the stamp is drawn in. */
  color?: string;
  opacity?: number;
  bold?: boolean;
  /** The classic bordered exhibit box. */
  bordered?: boolean;
  /** A white backing box, as Bates numbers use over scans. */
  backing?: boolean;
}

function textStyle(mark: MarkText, scale: number): CSSProperties {
  return {
    fontFamily: PREVIEW_FONT,
    fontSize: `${mark.fontSize * scale}px`,
    lineHeight: 1.15,
    fontWeight: mark.bold === false ? 400 : 700,
    color: mark.color ?? '#111114',
    opacity: mark.opacity ?? 1,
    whiteSpace: 'pre',
    backgroundColor: mark.backing === true || mark.bordered === true ? '#ffffff' : 'transparent',
    border: mark.bordered === true ? `${Math.max(1, scale)}px solid #000000` : undefined,
    padding:
      mark.bordered === true ? `${8 * scale}px` : mark.backing === true ? `${3 * scale}px` : 0,
  };
}

function Ink({ mark, scale, style }: { mark: MarkText; scale: number; style: CSSProperties }) {
  return (
    <span className={`absolute ${PENDING_OUTLINE}`} style={{ ...style, ...textStyle(mark, scale) }}>
      {mark.text}
    </span>
  );
}

interface CornerMarkProps {
  context: PageOverlayContext;
  corner: Corner;
  /** Inset from the page edge, in PDF points. */
  margin: number;
  mark: MarkText;
}

/** A mark tucked into one displayed corner — Bates numbers and exhibit stamps. */
export function CornerMark({ context, corner, margin, mark }: CornerMarkProps) {
  const inset = `${margin * context.scale}px`;
  const style: CSSProperties = {
    [corner.startsWith('top') ? 'top' : 'bottom']: inset,
    [corner.endsWith('left') ? 'left' : 'right']: inset,
  };
  return <Ink mark={mark} scale={context.scale} style={style} />;
}

interface BandMarkProps {
  context: PageOverlayContext;
  placement: 'header' | 'footer';
  alignment: Alignment;
  margin: number;
  mark: MarkText;
}

const BAND_ALIGNMENT: Record<Alignment, (inset: string) => CSSProperties> = {
  left: (inset) => ({ left: inset }),
  right: (inset) => ({ right: inset }),
  center: (inset) => ({ left: inset, right: inset, textAlign: 'center' }),
};

/** A header or footer mark — page numbers. */
export function BandMark({ context, placement, alignment, margin, mark }: BandMarkProps) {
  const inset = `${margin * context.scale}px`;
  const style: CSSProperties = {
    [placement === 'header' ? 'top' : 'bottom']: inset,
    ...BAND_ALIGNMENT[alignment](inset),
  };
  return <Ink mark={mark} scale={context.scale} style={style} />;
}

/** A mark across the middle of the page — watermarks. `spin` is anticlockwise. */
export function CentredMark({
  context,
  spin,
  mark,
}: {
  context: PageOverlayContext;
  spin: number;
  mark: MarkText;
}) {
  return (
    <Ink
      mark={mark}
      scale={context.scale}
      style={{
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) rotate(${-spin}deg)`,
        transformOrigin: 'center',
      }}
    />
  );
}

/**
 * Anything anchored at a point the attorney clicked. The anchor is the mark's
 * bottom-left as displayed, so the child grows up and to the right from it —
 * exactly how the flattened ink will sit.
 */
export function AnchoredMark({
  context,
  at,
  height,
  children,
}: {
  context: PageOverlayContext;
  at: PdfPoint;
  /** Mark height in PDF points, so the anchor lands on its bottom edge. */
  height: number;
  children: ReactNode;
}) {
  const box = context.toLocalBox({ x: at.x, y: at.y, width: 0, height: 0 });
  return (
    <div
      className="absolute"
      style={{ left: `${box.left}px`, top: `${box.top - height * context.scale}px` }}
    >
      {children}
    </div>
  );
}

/** A rectangle in PDF space as a box on screen — whiteout areas and signatures. */
export function RectMark({
  context,
  rect,
  className,
  children,
}: {
  context: PageOverlayContext;
  rect: PdfRect;
  className?: string;
  children?: ReactNode;
}) {
  const box = context.toLocalBox(rect);
  return (
    <div
      className={`absolute ${className ?? PENDING_OUTLINE}`}
      style={{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {children}
    </div>
  );
}

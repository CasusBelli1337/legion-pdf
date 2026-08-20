/**
 * What a stamp will look like, drawn over the real page before anything is
 * applied. Marks are positioned in the overlay's own box, which IS the page as
 * displayed — so a corner is the corner the attorney sees, on a rotated page
 * as much as an upright one, with no coordinate arithmetic to get wrong.
 *
 * These are previews: the browser measures the text, pdf-lib measures it again
 * when the stamp is applied, and the two agree to within a hair. The brand
 * dashed outline is the tell that nothing has been written to the file yet.
 */

import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { Alignment, Corner, ExhibitPosition, PdfPoint, PdfRect } from '@shared/types';
import { watermarkBaselineMid } from '@shared/watermark-placement';
import type { PageOverlayContext } from '@renderer/components/viewer';

/** The screen stand-in for the PDF base fonts the stamps are drawn in. */
const PREVIEW_FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";
const PENDING_OUTLINE = 'outline outline-1 outline-dashed outline-brand-400/70';
/**
 * Helvetica's cap height as a fraction of the em (718/1000). A bordered stamp
 * is boxed on the CAP BAND in core/stamps/label-box.ts, not on the font's line
 * box, so the preview's line box is squeezed to the same band — otherwise the
 * dashed box on screen would sit a descender lower than the ink that follows it
 * (13pt at 65pt, which is exactly the unevenness the box fix removed).
 */
const CAP_HEIGHT = 0.718;
/** Padding inside the border, in points — `LABEL_PADDING` on the core side. */
const BORDER_PADDING = 8;

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
  const bordered = mark.bordered === true;
  return {
    fontFamily: PREVIEW_FONT,
    fontSize: `${mark.fontSize * scale}px`,
    lineHeight: bordered ? CAP_HEIGHT : 1.15,
    fontWeight: mark.bold === false ? 400 : 700,
    color: mark.color ?? '#111114',
    opacity: mark.opacity ?? 1,
    whiteSpace: 'pre',
    backgroundColor: mark.backing === true || bordered ? '#ffffff' : 'transparent',
    border: bordered ? `${Math.max(1, scale)}px solid #000000` : undefined,
    padding: bordered
      ? `${BORDER_PADDING * scale}px`
      : mark.backing === true
        ? `${3 * scale}px`
        : 0,
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

/**
 * An exhibit stamp at any of its positions — the four corners, or centred on the
 * bottom edge at the same margin (core/stamps/geometry `stampAnchor`).
 */
export function StampMark({
  context,
  position,
  margin,
  mark,
}: {
  context: PageOverlayContext;
  position: ExhibitPosition;
  margin: number;
  mark: MarkText;
}) {
  if (position !== 'bottom-center') {
    return <CornerMark context={context} corner={position} margin={margin} mark={mark} />;
  }
  return (
    <Ink
      mark={mark}
      scale={context.scale}
      style={{
        bottom: `${margin * context.scale}px`,
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    />
  );
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

/**
 * Fits the dashed "nothing is in the file yet" outline around the glyphs the
 * browser actually drew. Measuring is the only way to learn how wide they came
 * out, and the answer is written straight to the rect: it is a DOM detail, not
 * app state, and a render pass per keystroke of watermark text is not worth it.
 */
function usePendingOutline(
  text: RefObject<SVGTextElement | null>,
  outline: RefObject<SVGRectElement | null>,
  follows: unknown[]
): void {
  useLayoutEffect(() => {
    if (text.current === null || outline.current === null) return;
    // getBBox answers a legacy SVGRect: four numbers, no DOMRect conveniences.
    const box = text.current.getBBox();
    outline.current.setAttribute('x', String(box.x));
    outline.current.setAttribute('y', String(box.y));
    outline.current.setAttribute('width', String(box.width));
    outline.current.setAttribute('height', String(box.height));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the glyph box follows these
  }, [outline, text, ...follows]);
}

/**
 * A mark across the middle of the page — watermarks. `spin` is anticlockwise.
 *
 * Drawn as SVG in the page's own point space, anchored on the MIDDLE OF THE
 * BASELINE that `@shared/watermark-placement` hands core/stamps/watermark.ts:
 * SVG puts text on a baseline the way a PDF does, so the preview and the applied
 * ink land on the same pixel instead of a CSS line box's guess at one.
 */
export function CentredMark({
  context,
  spin,
  mark,
}: {
  context: PageOverlayContext;
  spin: number;
  mark: MarkText;
}) {
  const text = useRef<SVGTextElement>(null);
  const outline = useRef<SVGRectElement>(null);
  const at = watermarkBaselineMid(context.size, mark.fontSize, spin);
  const x = at.x;
  // SVG's y runs down the page; PDF's runs up.
  const y = context.size.height - at.y;
  usePendingOutline(text, outline, [mark.text, mark.fontSize, spin]);

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${context.size.width} ${context.size.height}`}
      aria-hidden
    >
      <g transform={`rotate(${-spin} ${x} ${y})`}>
        <rect
          ref={outline}
          width={0}
          height={0}
          fill="none"
          stroke="currentColor"
          className="text-brand-400/70"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <text
          ref={text}
          x={x}
          y={y}
          textAnchor="middle"
          fontFamily={PREVIEW_FONT}
          fontWeight={700}
          fontSize={mark.fontSize}
          fill={mark.color ?? '#111114'}
          opacity={mark.opacity ?? 1}
        >
          {mark.text}
        </text>
      </g>
    </svg>
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

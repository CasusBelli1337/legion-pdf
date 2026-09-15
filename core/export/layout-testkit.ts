/**
 * TEST SUPPORT ONLY — hand-built page layouts with known geometry, so every
 * pass in core/export can be graded against numbers rather than a PDF.
 * A run's width is estimated at half an em per character, which is what an
 * average Latin face measures.
 */

import type {
  LayoutFont,
  LayoutImage,
  LayoutTextRole,
  LayoutTextRun,
  PageLayout,
} from '@shared/types';

export const LETTER = { width: 612, height: 792 };

export const FONTS: Record<string, LayoutFont> = {
  times: { name: 'TimesNewRomanPSMT', family: 'serif', bold: false, italic: false },
  timesBold: { name: 'TimesNewRomanPS-BoldMT', family: 'serif', bold: true, italic: false },
  arial: { name: 'ArialMT', family: 'sans-serif', bold: false, italic: false },
  courier: { name: 'CourierNewPSMT', family: 'monospace', bold: false, italic: false },
};

export interface RunSpec {
  fontKey?: string;
  sizePt?: number;
  role?: LayoutTextRole;
  colorHex?: string;
  hidden?: boolean;
  width?: number;
}

/** A run at (x, y) in the default 12pt Times, half an em per character wide. */
export function run(text: string, x: number, y: number, spec: RunSpec = {}): LayoutTextRun {
  const sizePt = spec.sizePt ?? 12;
  return {
    text,
    x,
    y,
    width: spec.width ?? text.length * sizePt * 0.5,
    sizePt,
    fontKey: spec.fontKey ?? 'times',
    colorHex: spec.colorHex ?? '#000000',
    role: spec.role ?? 'body',
    eol: false,
    ...(spec.hidden === true ? { hidden: true } : {}),
  };
}

export function page(
  runs: LayoutTextRun[],
  extra: Partial<Omit<PageLayout, 'runs'>> = {}
): PageLayout {
  return {
    page: 1,
    size: LETTER,
    rotation: 0,
    fonts: FONTS,
    runs,
    images: [],
    rules: [],
    printedPageNumber: null,
    ...extra,
  };
}

/** A body paragraph of `count` lines on a 14pt pitch from `top`, 1" margins. */
export function paragraphLines(
  count: number,
  top: number,
  options: { x?: number; pitch?: number; text?: string; sizePt?: number } = {}
): LayoutTextRun[] {
  const x = options.x ?? 72;
  const pitch = options.pitch ?? 14;
  const text =
    options.text ?? 'The quick brown fox jumps over the lazy dog and keeps on running far';
  return Array.from({ length: count }, (_unused, index) =>
    run(text, x, top - index * pitch, { sizePt: options.sizePt ?? 12 })
  );
}

/** A 1×1 white PNG: the smallest picture the docx package will embed. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

export function image(x: number, y: number, width: number, height: number): LayoutImage {
  return { rect: { x, y, width, height }, png: TINY_PNG, widthPx: 1, heightPx: 1 };
}

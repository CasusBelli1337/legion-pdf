/**
 * The graphics and text state a content stream carries between its operators,
 * and the operators that change it. Split out of the walker (text-runs.ts) so
 * the walker is about SHOWING glyphs and this file is about everything the
 * stream sets up before it does: transforms, spacing, the face and size, the
 * fill colour, and the render mode.
 *
 * The colour and render mode are new here for editing. Removing text never
 * needed them; putting text BACK does — a replaced paragraph has to be set in
 * the same colour, and an invisible OCR layer (render mode 3) must be refused
 * as an edit target because the words the attorney sees are pixels.
 */

import type { StreamToken } from './content-lexer';
import type { GlyphMetrics } from './font-widths';
import { IDENTITY, matrixFrom, multiply, translation, type Matrix } from './matrix';

export interface TextState {
  ctm: Matrix;
  stack: Matrix[];
  text: Matrix;
  line: Matrix;
  font: GlyphMetrics | null;
  /** The `/Fn` resource name in force, so an edit can set text in the same face. */
  fontName: string;
  size: number;
  charSpacing: number;
  wordSpacing: number;
  horizontal: number;
  leading: number;
  rise: number;
  /** `Tr`: 0 fill … 3 invisible, 7 clip. */
  renderMode: number;
  /** Fill colour as "#rrggbb"; black until the stream says otherwise. */
  fillColor: string;
}

export function initialState(ctm: Matrix): TextState {
  return {
    ctm,
    stack: [],
    text: IDENTITY,
    line: IDENTITY,
    font: null,
    fontName: '',
    size: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontal: 1,
    leading: 0,
    rise: 0,
    renderMode: 0,
    fillColor: '#000000',
  };
}

export function numbersOf(operands: readonly StreamToken[]): number[] {
  return operands.filter((token) => token.kind === 'number').map((token) => Number(token.text));
}

function last(values: readonly number[], fallback = 0): number {
  return values.at(-1) ?? fallback;
}

function nextLine(state: TextState, tx: number, ty: number): void {
  state.line = multiply(translation(tx, ty), state.line);
  state.text = state.line;
}

function channel(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Gray, RGB, or CMYK components → "#rrggbb". Anything else stays black. */
export function hexOfComponents(components: readonly number[]): string {
  const [a = 0, b = 0, c = 0, d = 0] = components;
  if (components.length === 1) return `#${channel(a)}${channel(a)}${channel(a)}`;
  if (components.length === 3) return `#${channel(a)}${channel(b)}${channel(c)}`;
  if (components.length === 4) {
    return `#${channel((1 - a) * (1 - d))}${channel((1 - b) * (1 - d))}${channel((1 - c) * (1 - d))}`;
  }
  return '#000000';
}

/** Sets the fill colour from the operands when they are plain numbers. */
function setFill(state: TextState, operands: readonly StreamToken[]): void {
  const numbers = numbersOf(operands);
  // A pattern (`/P1 scn`) has no components to read; leave the colour alone.
  if (numbers.length === 0 || numbers.length !== operands.length) return;
  state.fillColor = hexOfComponents(numbers);
}

export type StateHandler = (
  state: TextState,
  operands: StreamToken[],
  fonts: ReadonlyMap<string, GlyphMetrics>
) => void;

/** Every operator that changes state without showing anything. */
export const STATE_HANDLERS: Record<string, StateHandler> = {
  q: (state) => {
    state.stack.push(state.ctm);
  },
  Q: (state) => {
    state.ctm = state.stack.pop() ?? IDENTITY;
  },
  cm: (state, operands) => {
    state.ctm = multiply(matrixFrom(numbersOf(operands)), state.ctm);
  },
  BT: (state) => {
    state.text = IDENTITY;
    state.line = IDENTITY;
  },
  Tm: (state, operands) => {
    state.line = matrixFrom(numbersOf(operands));
    state.text = state.line;
  },
  Tf: (state, operands, fonts) => {
    const name = operands.filter((token) => token.kind === 'name').at(-1)?.text ?? '';
    state.fontName = name;
    state.font = fonts.get(name) ?? null;
    state.size = last(numbersOf(operands));
  },
  Td: (state, operands) => {
    const [tx = 0, ty = 0] = numbersOf(operands).slice(-2);
    nextLine(state, tx, ty);
  },
  TD: (state, operands) => {
    const [tx = 0, ty = 0] = numbersOf(operands).slice(-2);
    state.leading = -ty;
    nextLine(state, tx, ty);
  },
  'T*': (state) => nextLine(state, 0, -state.leading),
  TL: (state, operands) => {
    state.leading = last(numbersOf(operands));
  },
  Tc: (state, operands) => {
    state.charSpacing = last(numbersOf(operands));
  },
  Tw: (state, operands) => {
    state.wordSpacing = last(numbersOf(operands));
  },
  Tz: (state, operands) => {
    state.horizontal = last(numbersOf(operands), 100) / 100;
  },
  Ts: (state, operands) => {
    state.rise = last(numbersOf(operands));
  },
  Tr: (state, operands) => {
    state.renderMode = last(numbersOf(operands));
  },
  g: setFill,
  rg: setFill,
  k: setFill,
  sc: setFill,
  scn: setFill,
};

/** Moves to the next line the way `'` and `"` do before they show. */
export function lineFeed(state: TextState): void {
  nextLine(state, 0, -state.leading);
}

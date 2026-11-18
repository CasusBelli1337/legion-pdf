import { describe, expect, it } from 'vitest';
import { darkOfBits, darkOfColour } from './scan-ink';
import type { DarkPixels } from './scan-ink';
import { isPageSized, scanRulesOf } from './scan-rules';

const WIDTH = 850;
const HEIGHT = 1100;

/** A blank scanned page, a third of real resolution: 850 × 1100 for a letter sheet. */
function blank(): DarkPixels {
  return { width: WIDTH, height: HEIGHT, dark: new Uint8Array(WIDTH * HEIGHT) };
}

function ink(pixels: DarkPixels, x: number, y: number): void {
  if (x >= 0 && x < pixels.width && y >= 0 && y < pixels.height) {
    pixels.dark[y * pixels.width + x] = 1;
  }
}

/** An upright stroke `thick` pixels wide from `top` to `bottom`, leaning `lean` pixels over its run. */
function upright(pixels: DarkPixels, x: number, top: number, bottom: number, thick = 2, lean = 0) {
  for (let y = top; y < bottom; y += 1) {
    const shift = Math.round((lean * (y - top)) / (bottom - top));
    for (let dx = 0; dx < thick; dx += 1) ink(pixels, x + shift + dx, y);
  }
}

function level(pixels: DarkPixels, y: number, left: number, right: number, thick = 2) {
  for (let x = left; x < right; x += 1) {
    for (let dy = 0; dy < thick; dy += 1) ink(pixels, x, y + dy);
  }
}

/** Lines of "type": short strokes with gaps, stacked line over line down the page. */
function type(pixels: DarkPixels, left: number, right: number, top: number, bottom: number) {
  for (let line = top; line < bottom; line += 30) {
    for (let x = left; x < right; x += 9) {
      for (let y = line; y < line + 12; y += 1) {
        ink(pixels, x, y);
        ink(pixels, x + 1, y);
      }
      for (let dx = 0; dx < 6; dx += 1) ink(pixels, x + dx, line + 11);
    }
  }
}

describe('scanRulesOf', () => {
  it('finds a pleading’s double rule and the rule down its right edge, to the pixel at their ends', () => {
    const page = blank();
    upright(page, 170, 40, 1060);
    upright(page, 175, 40, 1060);
    upright(page, 780, 43, 1050, 1);
    const rules = scanRulesOf(page).sort((a, b) => a.x - b.x);
    expect(rules).toHaveLength(3);
    expect(rules.map((rule) => Math.round(rule.x))).toEqual([170, 175, 780]);
    expect(rules[0]).toMatchObject({ y: 40, height: 1020, width: 2 });
    expect(rules[2]).toMatchObject({ y: 43, height: 1007, width: 1 });
  });

  it('follows a rule that leans, as a scan never sits square on the glass', () => {
    const page = blank();
    upright(page, 170, 40, 1060, 1, 9);
    const rules = scanRulesOf(page);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.height).toBe(1020);
    expect(rules[0]?.x).toBeGreaterThan(170);
    expect(rules[0]?.x).toBeLessThan(180);
  });

  it('finds a caption box’s foot and the line under a heading', () => {
    const page = blank();
    level(page, 500, 180, 460);
    level(page, 300, 380, 560, 1);
    const rules = scanRulesOf(page).sort((a, b) => a.y - b.y);
    expect(rules.map((rule) => [rule.x, rule.y, rule.width, rule.height])).toEqual([
      [380, 300, 180, 1],
      [180, 500, 280, 2],
    ]);
  });

  it('carries a rule across a gap a stamp left in it, but not across half the page', () => {
    const page = blank();
    upright(page, 400, 100, 500);
    upright(page, 400, 540, 1000);
    upright(page, 600, 100, 300);
    upright(page, 600, 700, 1000);
    const rules = scanRulesOf(page).sort((a, b) => a.x - b.x || a.y - b.y);
    expect(rules.map((rule) => [rule.x, rule.y, rule.height])).toEqual([
      [400, 100, 900],
      [600, 100, 200],
      [600, 700, 300],
    ]);
  });

  it('takes no line of type, however many lines stack up, for a rule', () => {
    const page = blank();
    type(page, 190, 760, 60, 1040);
    expect(scanRulesOf(page)).toEqual([]);
  });

  it('ignores a filled panel, a tick, and the scanner’s shadow at the paper’s edge', () => {
    const page = blank();
    upright(page, 300, 100, 900, 30);
    upright(page, 500, 100, 140);
    upright(page, 2, 0, HEIGHT, 3);
    level(page, 600, 100, 130);
    expect(scanRulesOf(page)).toEqual([]);
  });

  it('reads nothing off a picture too small to be a page', () => {
    const logo: DarkPixels = { width: 300, height: 300, dark: new Uint8Array(90000).fill(1) };
    expect(isPageSized(300, 300)).toBe(false);
    expect(scanRulesOf(logo)).toEqual([]);
  });
});

describe('ink', () => {
  it('reads colour pixels as ink below a mid grey: a scanned hairline is not black', () => {
    const rgba = [0, 0, 0, 255, 150, 150, 150, 255, 200, 200, 200, 255, 255, 255, 255, 255];
    expect([...darkOfColour(rgba, 4, 1, 4).dark]).toEqual([1, 1, 0, 0]);
    expect([...darkOfColour([10, 10, 10, 250, 250, 250], 2, 1, 3).dark]).toEqual([1, 0]);
  });

  it('reads packed one-bit rows, each row starting on a byte', () => {
    // Two rows of ten pixels; a 1 bit is paper in a pdfjs grey image.
    const data = [0b01111111, 0b11000000, 0b11111111, 0b10000000];
    const { dark } = darkOfBits(data, 10, 2, 0);
    expect([...dark.slice(0, 10)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...dark.slice(10)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });
});

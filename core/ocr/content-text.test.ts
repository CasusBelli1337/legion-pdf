import { describe, expect, it } from 'vitest';
import { countShownCharacters } from './content-text';

function stream(source: string): Uint8Array {
  return new TextEncoder().encode(source);
}

describe('countShownCharacters', () => {
  it('counts a simple Tj string', () => {
    expect(countShownCharacters(stream('BT /F1 12 Tf 72 700 Td (Hello) Tj ET'))).toBe(5);
  });

  it('counts every string inside a TJ array, ignoring the kerning numbers', () => {
    expect(countShownCharacters(stream('BT [(Hel) -250 (lo) 12 (!)] TJ ET'))).toBe(6);
  });

  it('counts the quote operators', () => {
    expect(countShownCharacters(stream('BT (line one) \' (line two) 0 0 " ET'))).toBe(16);
  });

  it('reads hex strings as two digits per character', () => {
    expect(countShownCharacters(stream('BT <48656C6C6F> Tj ET'))).toBe(5);
  });

  it('is not fooled by a dictionary that looks like a hex string', () => {
    expect(countShownCharacters(stream('<< /Type /Page >> BT (ok) Tj ET'))).toBe(2);
  });

  it('is not fooled by parentheses inside a string', () => {
    // The balanced inner parentheses are part of the shown text: "a (nested) b".
    expect(countShownCharacters(stream('BT (a (nested) b) Tj ET'))).toBe(12);
  });

  it('is not fooled by an escaped closing parenthesis', () => {
    expect(countShownCharacters(stream('BT (a\\)b) Tj ET'))).toBe(3);
  });

  it('counts an octal escape as one character', () => {
    expect(countShownCharacters(stream('BT (\\251 2026) Tj ET'))).toBe(6);
  });

  it('ignores text-shaped content inside a comment', () => {
    expect(countShownCharacters(stream('% (commented) Tj\nBT (real) Tj ET'))).toBe(4);
  });

  it('does not read a resource name as an operator', () => {
    expect(countShownCharacters(stream('BT (x) /TJ 1 Tf ET'))).toBe(0);
  });

  it('returns zero for a scanned page that only draws an image', () => {
    expect(countShownCharacters(stream('q 612 0 0 792 0 0 cm /Im0 Do Q'))).toBe(0);
  });

  it('returns zero for an empty stream', () => {
    expect(countShownCharacters(new Uint8Array())).toBe(0);
  });

  it('terminates on a truncated string rather than looping forever', () => {
    expect(countShownCharacters(stream('BT (unterminated'))).toBe(0);
  });
});

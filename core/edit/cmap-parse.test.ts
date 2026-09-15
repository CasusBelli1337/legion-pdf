import { describe, expect, it } from 'vitest';
import { parseToUnicode } from './cmap-parse';

const encoder = new TextEncoder();

function parse(text: string) {
  return parseToUnicode(encoder.encode(text));
}

describe('parseToUnicode', () => {
  it('reads bfchar pairs and the codespace width', () => {
    const map = parse(`
      1 begincodespacerange <0000> <FFFF> endcodespacerange
      2 beginbfchar
      <0003> <0041>
      <0004> <00E9>
      endbfchar`);
    expect(map.codeBytes).toBe(2);
    expect(map.forward.get(3)).toBe('A');
    expect(map.forward.get(4)).toBe('é');
  });

  it('expands a bfrange with one destination by stepping the last character', () => {
    const map = parse(`1 beginbfrange <0010> <0012> <0061> endbfrange`);
    expect([0x10, 0x11, 0x12].map((code) => map.forward.get(code))).toEqual(['a', 'b', 'c']);
  });

  it('reads a bfrange with an array of destinations', () => {
    const map = parse(`1 beginbfrange <0020> <0022> [<0078> <0079> <007A>] endbfrange`);
    expect([0x20, 0x21, 0x22].map((code) => map.forward.get(code))).toEqual(['x', 'y', 'z']);
  });

  it('keeps a ligature as the characters it stands for', () => {
    const map = parse(`1 beginbfchar <0005> <00660069> endbfchar`);
    expect(map.forward.get(5)).toBe('fi');
  });

  it('decodes a surrogate pair into one supplementary character', () => {
    const map = parse(`1 beginbfchar <0006> <D83DDE00> endbfchar`);
    expect(map.forward.get(6)).toBe('😀');
  });

  it('reads single-byte codespaces as one byte per code', () => {
    const map = parse(
      `1 begincodespacerange <00> <FF> endcodespacerange 1 beginbfchar <41> <0041> endbfchar`
    );
    expect(map.codeBytes).toBe(1);
    expect(map.forward.get(0x41)).toBe('A');
  });
});

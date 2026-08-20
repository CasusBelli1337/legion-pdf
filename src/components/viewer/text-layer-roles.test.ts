import { describe, expect, it } from 'vitest';
import {
  ITEM_INDEX_ATTRIBUTE,
  PAGE_ATTRIBUTE,
  ROLE_ATTRIBUTE,
  applyTextRoles,
  renderedItemIndexes,
  tagTextSpans,
} from './text-layer-roles';
import type { TextRole } from '../../features/select-copy/contract';

/** pdfjs hands back text items and marked-content markers in one array. */
const textItem = (str: string) => ({ str, transform: [1, 0, 0, 1, 0, 0], width: 10, height: 10 });
const marker = (type: string) => ({ type, id: null });

interface FakeSpan {
  attributes: Map<string, string>;
}

function fakeSpan(): FakeSpan {
  return { attributes: new Map<string, string>() };
}

function asElement(span: FakeSpan): HTMLElement {
  return {
    setAttribute: (name: string, value: string) => span.attributes.set(name, value),
    getAttribute: (name: string) => span.attributes.get(name) ?? null,
    removeAttribute: (name: string) => span.attributes.delete(name),
  } as unknown as HTMLElement;
}

describe('renderedItemIndexes', () => {
  it('counts marked-content entries in the numbering but renders no span for them', () => {
    const items = [
      textItem('IN THE SUPERIOR COURT'), // 0
      marker('beginMarkedContent'), //      1 — no span
      textItem('1'), //                     2
      textItem('  Q. State your name.'), // 3
      marker('endMarkedContent'), //        4 — no span
      textItem('2'), //                     5
    ];
    expect(renderedItemIndexes(items)).toEqual([0, 2, 3, 5]);
  });

  it('renders a span for an empty string, which pdfjs does', () => {
    expect(renderedItemIndexes([textItem(''), textItem('x')])).toEqual([0, 1]);
  });

  it('has nothing to say about an empty page', () => {
    expect(renderedItemIndexes([])).toEqual([]);
  });
});

describe('tagTextSpans', () => {
  it('stamps the page and the ORIGINAL item index onto every span', () => {
    const spans = [fakeSpan(), fakeSpan(), fakeSpan()];
    const items = [textItem('a'), marker('beginMarkedContent'), textItem('b'), textItem('c')];

    const tagged = tagTextSpans(spans.map(asElement), items, 7);

    expect(tagged).toBe(3);
    expect(spans.map((span) => span.attributes.get(ITEM_INDEX_ATTRIBUTE))).toEqual(['0', '2', '3']);
    expect(spans.every((span) => span.attributes.get(PAGE_ATTRIBUTE) === '7')).toBe(true);
  });

  it('stops cleanly when pdfjs truncated a pathological page', () => {
    const spans = [fakeSpan(), fakeSpan()];
    expect(tagTextSpans(spans.map(asElement), [textItem('a')], 1)).toBe(1);
    expect(spans[1]?.attributes.has(ITEM_INDEX_ATTRIBUTE)).toBe(false);
  });
});

describe('applyTextRoles', () => {
  function containerOf(spans: FakeSpan[]): HTMLElement {
    return {
      querySelectorAll: () => spans.map(asElement),
    } as unknown as HTMLElement;
  }

  it('marks only the spans that are not body text', () => {
    const spans = [fakeSpan(), fakeSpan()];
    spans[0]?.attributes.set(ITEM_INDEX_ATTRIBUTE, '0');
    spans[1]?.attributes.set(ITEM_INDEX_ATTRIBUTE, '1');
    const roles = new Map<number, TextRole>([
      [0, 'line-number'],
      [1, 'body'],
    ]);

    applyTextRoles(containerOf(spans), roles);

    expect(spans[0]?.attributes.get(ROLE_ATTRIBUTE)).toBe('line-number');
    expect(spans[1]?.attributes.get(ROLE_ATTRIBUTE)).toBe('body');
  });

  it('with no classification leaves every span exactly as it was', () => {
    const spans = [fakeSpan()];
    spans[0]?.attributes.set(ITEM_INDEX_ATTRIBUTE, '0');

    applyTextRoles(containerOf(spans), null);

    expect(spans[0]?.attributes.has(ROLE_ATTRIBUTE)).toBe(false);
  });

  it('clears a stale role when a page is reclassified', () => {
    const spans = [fakeSpan()];
    spans[0]?.attributes.set(ITEM_INDEX_ATTRIBUTE, '4');
    spans[0]?.attributes.set(ROLE_ATTRIBUTE, 'stamp');

    applyTextRoles(containerOf(spans), new Map<number, TextRole>([[9, 'stamp']]));

    expect(spans[0]?.attributes.has(ROLE_ATTRIBUTE)).toBe(false);
  });

  it('is safe before the page has mounted', () => {
    expect(() => applyTextRoles(null, null)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { blockOfEachText, blocksOf } from './struct-tags';

const tree = {
  role: 'Root',
  children: [
    {
      role: 'Document',
      children: [
        {
          role: 'P',
          children: [
            { type: 'content', id: 'p1_mc0' },
            { type: 'content', id: 'p1_mc1' },
          ],
        },
        { role: 'H1', children: [{ type: 'content', id: 'p1_mc2' }] },
        {
          role: 'Table',
          children: [
            {
              role: 'TR',
              children: [
                {
                  role: 'TD',
                  children: [{ role: 'P', children: [{ type: 'content', id: 'p1_mc3' }] }],
                },
                {
                  role: 'TD',
                  children: [{ role: 'Caption', children: [{ type: 'content', id: 'p1_mc4' }] }],
                },
              ],
            },
          ],
        },
        { role: 'Artifact', children: [{ type: 'content', id: 'p1_mc5' }] },
      ],
    },
  ],
};

describe('blocksOf', () => {
  it('maps every marked-content id to the paragraph-level block that owns it', () => {
    const blocks = blocksOf(tree);
    expect(blocks.get('p1_mc0')).toEqual(blocks.get('p1_mc1'));
    expect(blocks.get('p1_mc0')?.role).toBe('paragraph');
    expect(blocks.get('p1_mc2')?.role).toBe('heading');
    expect(blocks.get('p1_mc2')?.id).not.toBe(blocks.get('p1_mc0')?.id);
  });

  it('prefixes blocks inside table cells with their cell, so cells never merge', () => {
    const blocks = blocksOf(tree);
    const left = blocks.get('p1_mc3');
    const right = blocks.get('p1_mc4');
    expect(left?.id.split('/')).toHaveLength(2);
    expect(left?.id.split('/')[0]).not.toBe(right?.id.split('/')[0]);
    expect(right?.role).toBe('caption');
  });

  it('leaves artifacts (running heads, line numbers) and untagged pages without a block', () => {
    expect(blocksOf(tree).has('p1_mc5')).toBe(false);
    expect(blocksOf(null).size).toBe(0);
  });
});

describe('blockOfEachText', () => {
  it('gives each text item the innermost open marked content, in text-item order', () => {
    const blocks = blocksOf(tree);
    const items = [
      { type: 'beginMarkedContentProps', id: 'p1_mc0', tag: 'P' },
      { str: 'First' },
      { type: 'beginMarkedContentProps', id: 'p1_mc1', tag: 'Span' },
      { str: 'still first' },
      { type: 'endMarkedContent' },
      { type: 'endMarkedContent' },
      { type: 'beginMarkedContent', tag: 'Artifact' },
      { str: '12' },
      { type: 'endMarkedContent' },
      { type: 'beginMarkedContentProps', id: 'p1_mc2', tag: 'H1' },
      { str: 'Heading' },
      { type: 'endMarkedContent' },
      { str: 'loose' },
    ];
    const roles = blockOfEachText(items, blocks).map((block) => block?.role ?? null);
    expect(roles).toEqual(['paragraph', 'paragraph', null, 'heading', null]);
  });
});

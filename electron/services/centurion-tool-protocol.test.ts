import { describe, expect, it } from 'vitest';
import { CENTURION_TOOLS, toolDefinition, toolParams } from './centurion-tool-protocol';

describe('the tool catalogue offered to Centurion', () => {
  it('offers exactly the seven document tools, each with a schema', () => {
    expect(CENTURION_TOOLS.map((tool) => tool.name)).toEqual([
      'applyBates',
      'applyWatermark',
      'applyExhibitStamp',
      'applyPageNumbers',
      'setBookmarks',
      'suggestRedactions',
      'addSignatureFields',
    ]);
    for (const tool of CENTURION_TOOLS) {
      // Descriptions carry the "when to use it", which is what the model reads.
      expect(tool.description.length).toBeGreaterThan(120);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Object.keys(tool.inputSchema.properties).length).toBeGreaterThan(0);
      for (const key of tool.inputSchema.required) {
        expect(Object.keys(tool.inputSchema.properties)).toContain(key);
      }
    }
  });

  // Redaction is destruction, and e-sign fields are panel metadata: neither
  // tool ever runs against the bytes.
  it('keeps redaction and signature fields out of the main process', () => {
    expect(toolDefinition('suggestRedactions').runsIn).toBe('renderer');
    expect(toolDefinition('addSignatureFields').runsIn).toBe('renderer');
    for (const name of ['applyBates', 'applyWatermark', 'setBookmarks'] as const) {
      expect(toolDefinition(name).runsIn).toBe('main');
    }
  });

  it('tells the model a page list may be left out, except where it may not', () => {
    expect(toolDefinition('applyBates').inputSchema.required).not.toContain('pages');
    // An exhibit label belongs on named pages, never on a whole production.
    expect(toolDefinition('applyExhibitStamp').inputSchema.required).toContain('pages');
  });

  it('hands the SDK the name, description, and schema of every tool', () => {
    const params = toolParams();
    expect(params).toHaveLength(CENTURION_TOOLS.length);
    expect(params[0]).toMatchObject({
      name: 'applyBates',
      input_schema: { type: 'object' },
    });
    expect(String(params[0]?.description)).toContain('Bates');
  });

  it('refuses to describe a tool that does not exist', () => {
    expect(() => toolDefinition('nonsense' as never)).toThrow(/Unknown tool/);
  });
});

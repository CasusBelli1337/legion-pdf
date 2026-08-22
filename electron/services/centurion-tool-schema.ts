/**
 * The JSON-schema vocabulary the Centurion tool catalogue is written in: the
 * node types the SDK accepts and the small builders that keep each tool's
 * schema in ./centurion-tool-protocol readable as a sentence rather than as
 * nested object literals.
 */

import type { CenturionToolName } from '@shared/types';

export interface JsonSchemaNode {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  description?: string;
  enum?: string[];
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
}

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaNode>;
  required: string[];
  additionalProperties: false;
  /** The SDK's own schema type carries one; without it these are not assignable. */
  [key: string]: unknown;
}

export interface CenturionToolDefinition {
  name: CenturionToolName;
  /** Written for the model: what it does, and when to reach for it. */
  description: string;
  inputSchema: JsonSchemaObject;
  /**
   * Where an approved call runs. 'main' rewrites the document's bytes;
   * 'renderer' only proposes marks and never destroys anything.
   */
  runsIn: 'main' | 'renderer';
}

export const text = (description: string): JsonSchemaNode => ({ type: 'string', description });

export const whole = (description: string, minimum: number, maximum?: number): JsonSchemaNode => ({
  type: 'integer',
  description,
  minimum,
  ...(maximum === undefined ? {} : { maximum }),
});

export const oneOf = (values: string[], description: string): JsonSchemaNode => ({
  type: 'string',
  enum: values,
  description,
});

export const listOf = (items: JsonSchemaNode, description: string): JsonSchemaNode => ({
  type: 'array',
  minItems: 1,
  description,
  items,
});

export const object = (
  properties: Record<string, JsonSchemaNode>,
  required: string[]
): JsonSchemaNode => ({
  type: 'object',
  properties,
  required,
});

export const PAGE_NUMBER: JsonSchemaNode = { type: 'integer', minimum: 1 };

export const PAGES: JsonSchemaNode = {
  type: 'array',
  description: 'The 1-based pages to act on. Omit this to act on every page.',
  items: PAGE_NUMBER,
};

export const REQUIRED_PAGES = listOf(PAGE_NUMBER, 'The 1-based pages this goes on. Required.');

export const BOOKMARK_TITLE = text('What the reader sees in the bookmark pane.');
export const BOOKMARK_PAGE = whole('The 1-based page it jumps to.', 1);
export const BOOKMARK_LEAF = object({ title: BOOKMARK_TITLE, page: BOOKMARK_PAGE }, [
  'title',
  'page',
]);

export function schema(
  properties: Record<string, JsonSchemaNode>,
  required: string[]
): JsonSchemaObject {
  return { type: 'object', additionalProperties: false, properties, required };
}

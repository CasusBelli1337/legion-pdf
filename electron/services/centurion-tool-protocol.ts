/**
 * The tool catalogue Centurion is offered, and the protocol one proposed call
 * goes through: validate, show the attorney a card, wait, run, hand the result
 * back to the model.
 *
 * The catalogue is main-side on purpose. The renderer never needs a JSON
 * schema — it gets the validated input on the proposal — and keeping the
 * schemas next to the protocol that enforces them means the description the
 * model reads and the narrowing it is held to cannot drift apart.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type {
  AiChunk,
  CenturionToolCall,
  CenturionToolDecision,
  CenturionToolName,
  CenturionToolProposal,
  CenturionToolResult,
} from '@shared/types';
import {
  CORNERS,
  CenturionToolInputError,
  EXHIBIT_POSITIONS,
  PAGE_NUMBER_SPOTS,
  detailOf,
  validateToolCall,
  verdictOf,
} from '@shared/centurion-tools';

/* ── the schemas the model sees ───────────────────────────────────────── */

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

const text = (description: string): JsonSchemaNode => ({ type: 'string', description });

const whole = (description: string, minimum: number, maximum?: number): JsonSchemaNode => ({
  type: 'integer',
  description,
  minimum,
  ...(maximum === undefined ? {} : { maximum }),
});

const oneOf = (values: string[], description: string): JsonSchemaNode => ({
  type: 'string',
  enum: values,
  description,
});

const listOf = (items: JsonSchemaNode, description: string): JsonSchemaNode => ({
  type: 'array',
  minItems: 1,
  description,
  items,
});

const object = (
  properties: Record<string, JsonSchemaNode>,
  required: string[]
): JsonSchemaNode => ({
  type: 'object',
  properties,
  required,
});

const PAGE_NUMBER: JsonSchemaNode = { type: 'integer', minimum: 1 };

const PAGES: JsonSchemaNode = {
  type: 'array',
  description: 'The 1-based pages to act on. Omit this to act on every page.',
  items: PAGE_NUMBER,
};

const REQUIRED_PAGES = listOf(PAGE_NUMBER, 'The 1-based pages this goes on. Required.');

const BOOKMARK_TITLE = text('What the reader sees in the bookmark pane.');
const BOOKMARK_PAGE = whole('The 1-based page it jumps to.', 1);
const BOOKMARK_LEAF = object({ title: BOOKMARK_TITLE, page: BOOKMARK_PAGE }, ['title', 'page']);

function schema(properties: Record<string, JsonSchemaNode>, required: string[]): JsonSchemaObject {
  return { type: 'object', additionalProperties: false, properties, required };
}

export const CENTURION_TOOLS: CenturionToolDefinition[] = [
  {
    name: 'applyBates',
    runsIn: 'main',
    description:
      'Stamp a continuous Bates production number into the pages of the open document. ' +
      'Use it when the attorney asks to Bates-stamp, number a production, or apply ' +
      'production numbers with a prefix. Numbering runs in page order from startNumber. ' +
      'Read the document first if the prefix or starting number is not stated - existing ' +
      'numbers on the page usually tell you both.',
    inputSchema: schema(
      {
        prefix: text('Party or production prefix, e.g. "PLAINTIFF". May be empty.'),
        startNumber: whole('The first number stamped.', 0),
        padWidth: whole('Zero-padded digits, e.g. 6 gives PLAINTIFF000001.', 0, 12),
        position: oneOf(CORNERS, 'Which corner it sits in.'),
        pages: PAGES,
      },
      ['prefix', 'startNumber', 'padWidth', 'position']
    ),
  },
  {
    name: 'applyWatermark',
    runsIn: 'main',
    description:
      'Draw translucent watermark text across the pages, e.g. DRAFT, CONFIDENTIAL, or ' +
      'ATTORNEY WORK PRODUCT. Use it when the attorney asks to watermark a document or mark ' +
      'it confidential. The page underneath stays readable through the watermark.',
    inputSchema: schema(
      {
        text: text('The watermark wording, e.g. "CONFIDENTIAL".'),
        orientation: oneOf(['diagonal', 'horizontal'], 'Diagonal is the usual choice.'),
        opacityPct: whole('Strength from 1 to 100; 25 keeps the page readable.', 1, 100),
        pages: PAGES,
      },
      ['text', 'orientation', 'opacityPct']
    ),
  },
  {
    name: 'applyExhibitStamp',
    runsIn: 'main',
    description:
      'Stamp an exhibit label such as "EXHIBIT A" in a bordered box on the pages given. ' +
      'Use it when the attorney asks to label exhibits or mark an exhibit page. Stamp only ' +
      "the exhibit's first page unless asked otherwise, and give one call per label.",
    inputSchema: schema(
      {
        label: text('The rendered label, e.g. "EXHIBIT A".'),
        position: oneOf(EXHIBIT_POSITIONS, 'Where the box sits on the page.'),
        pages: REQUIRED_PAGES,
      },
      ['label', 'position', 'pages']
    ),
  },
  {
    name: 'applyPageNumbers',
    runsIn: 'main',
    description:
      'Add reader page numbers in a header or footer, formatted "Page 1 of 20". Use it when ' +
      'the attorney asks for page numbers on a brief or a set of pages. This is not Bates ' +
      'numbering - reach for applyBates when the ask is about a production.',
    inputSchema: schema(
      {
        position: oneOf(PAGE_NUMBER_SPOTS, 'Header or footer, left, centre, or right.'),
        pages: PAGES,
      },
      ['position']
    ),
  },
  {
    name: 'setBookmarks',
    runsIn: 'main',
    description:
      'Replace the document outline with the bookmark tree given. Use it when the attorney ' +
      'asks to bookmark exhibits, sections, or deposition topics. This replaces every ' +
      'existing bookmark, so include the ones worth keeping. Read the document first so each ' +
      'title points at the page it names.',
    inputSchema: schema(
      {
        bookmarks: listOf(
          object(
            {
              title: BOOKMARK_TITLE,
              page: BOOKMARK_PAGE,
              children: listOf(BOOKMARK_LEAF, 'Nested bookmarks.'),
            },
            ['title', 'page']
          ),
          'Top-level bookmarks, in document order.'
        ),
      },
      ['bookmarks']
    ),
  },
  {
    name: 'suggestRedactions',
    runsIn: 'renderer',
    description:
      'Propose text to redact. Every instance of each term is MARKED in the redaction panel for ' +
      'the attorney to review; nothing is destroyed - he applies the redaction himself. Use it ' +
      'when asked to find or suggest redactions, or to find personal data such as social ' +
      'security numbers, account numbers, dates of birth, home addresses, or medical details. ' +
      'Quote each term exactly as it appears in the document, or it will not be found.',
    inputSchema: schema(
      {
        terms: listOf(
          object(
            {
              text: text('The exact text as it appears on the page.'),
              reason: text('Why it should go, e.g. "Social security number".'),
            },
            ['text', 'reason']
          ),
          'The exact strings to mark, each with a short reason.'
        ),
      },
      ['terms']
    ),
  },
];

export function toolDefinition(name: CenturionToolName): CenturionToolDefinition {
  const found = CENTURION_TOOLS.find((tool) => tool.name === name);
  if (found === undefined) throw new CenturionToolInputError(`Unknown tool "${name}".`);
  return found;
}

export function toolParams(): Anthropic.Tool[] {
  return CENTURION_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/* ── one proposed call, from tool_use to tool_result ──────────────────── */

/** What the model is told when a confirm card comes back refused. */
export const DECLINED_RESULT = 'The attorney declined this action.';

/** Main's side of a tool call: the sentence, the wait, and the work. */
export interface CenturionToolHooks {
  /** The plain-English one-liner the confirm card shows. */
  summarize(call: CenturionToolCall): string;
  /** Resolves when the attorney answers. Silence resolves as a refusal. */
  confirm(requestId: string, toolUseId: string): Promise<CenturionToolDecision>;
  /** Runs an approved main-side call; the receipt is quoted back to the model. */
  execute(call: CenturionToolCall): Promise<string>;
}

function toolResult(
  toolUseId: string,
  content: string,
  isError: boolean
): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError };
}

/** A validation refusal is already written for the model; anything else is a bug. */
function readableInput(error: unknown): string {
  if (error instanceof CenturionToolInputError) return error.message;
  return 'That tool call could not be read. Check it against the tool schema and try once more.';
}

function plainMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Approved: main rewrites the bytes, unless the renderer already did the work. */
async function runApproved(
  hooks: CenturionToolHooks,
  call: CenturionToolCall,
  toolUseId: string,
  decision: CenturionToolDecision,
  settle: (result: CenturionToolResult) => void
): Promise<Anthropic.ToolResultBlockParam> {
  if (toolDefinition(call.name).runsIn === 'renderer') {
    const detail = detailOf(decision) ?? 'The terms were marked in the redaction panel.';
    settle({ outcome: 'done', message: detail });
    return toolResult(toolUseId, detail, false);
  }
  try {
    const receipt = await hooks.execute(call);
    settle({ outcome: 'done', message: receipt });
    return toolResult(toolUseId, receipt, false);
  } catch (error) {
    const message = plainMessage(error);
    settle({ outcome: 'failed', message });
    return toolResult(toolUseId, `That did not run: ${message}`, true);
  }
}

async function answerOne(
  hooks: CenturionToolHooks,
  block: Anthropic.ToolUseBlock,
  requestId: string,
  onChunk: (chunk: AiChunk) => void
): Promise<Anthropic.ToolResultBlockParam> {
  let call: CenturionToolCall;
  try {
    call = validateToolCall(block.name, block.input);
  } catch (error) {
    // No card was ever shown: the model gets the reason and corrects itself.
    return toolResult(block.id, readableInput(error), true);
  }

  const proposal: CenturionToolProposal = {
    toolUseId: block.id,
    name: call.name,
    input: call.input,
    summary: hooks.summarize(call),
  };
  onChunk({ requestId, text: '', done: false, proposal });
  const settle = (result: CenturionToolResult): void =>
    onChunk({ requestId, text: '', done: false, proposal: { ...proposal, result } });

  const decision = await hooks.confirm(requestId, block.id);
  if (verdictOf(decision) === 'rejected') {
    settle({ outcome: 'skipped', message: detailOf(decision) ?? 'Skipped.' });
    return toolResult(block.id, DECLINED_RESULT, false);
  }
  return runApproved(hooks, call, block.id, decision, settle);
}

/**
 * Every tool call in one assistant turn, answered in the order the model asked.
 * Strictly one card at a time: two cards racing for the same Approve button is
 * not a decision an attorney can make.
 */
export async function answerToolUses(
  hooks: CenturionToolHooks | undefined,
  message: Anthropic.Message,
  requestId: string,
  onChunk: (chunk: AiChunk) => void
): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of message.content) {
    if (block.type !== 'tool_use') continue;
    results.push(
      hooks === undefined
        ? toolResult(block.id, 'Tools are switched off for this conversation.', true)
        : await answerOne(hooks, block, requestId, onChunk)
    );
  }
  return results;
}

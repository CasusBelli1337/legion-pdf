/**
 * The protocol one proposed Centurion tool call goes through: validate, show
 * the attorney a card, wait, run, hand the result back to the model.
 *
 * The catalogue of tool definitions itself lives in ./centurion-tool-catalog
 * and is re-exported here, so callers keep one import point for "the tools".
 */

import type Anthropic from '@anthropic-ai/sdk';
import type {
  AiChunk,
  CenturionToolCall,
  CenturionToolDecision,
  CenturionToolProposal,
  CenturionToolResult,
} from '@shared/types';
import {
  CenturionToolInputError,
  detailOf,
  validateToolCall,
  verdictOf,
} from '@shared/centurion-tools';
import { toolDefinition } from './centurion-tool-catalog';

export { CENTURION_TOOLS, toolDefinition, toolParams } from './centurion-tool-catalog';
export type {
  CenturionToolDefinition,
  JsonSchemaNode,
  JsonSchemaObject,
} from './centurion-tool-schema';

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

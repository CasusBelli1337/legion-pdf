/**
 * The words a confirm card is made of. Main sends the one-line summary and the
 * settings it validated; this turns those settings into the plain-English lines
 * the attorney reads before pressing Approve — "Prefix: PLAINTIFF", never
 * `{"prefix":"PLAINTIFF"}`.
 *
 * The same validator main used narrows the input again here, so the detail can
 * never describe a shape that was never accepted.
 */

import type { CenturionToolCall, CenturionToolName } from '@shared/types';
import { validateToolCall } from '@shared/centurion-tools';

/** What the card is called, in the words the tool panels use. */
export const TOOL_TITLES: Record<CenturionToolName, string> = {
  applyBates: 'Bates numbering',
  applyWatermark: 'Watermark',
  applyExhibitStamp: 'Exhibit stamp',
  applyPageNumbers: 'Page numbers',
  setBookmarks: 'Bookmarks',
  suggestRedactions: 'Suggested redactions',
};

export interface DetailLine {
  label: string;
  value: string;
}

const POSITION_WORDS: Record<string, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

/** "1-30, 45" — runs collapsed, the way the stamping panels take a range. */
export function formatPageList(pages: number[] | undefined): string {
  if (pages === undefined) return 'Every page';
  const [head, ...rest] = pages;
  if (head === undefined) return 'No pages';

  const parts: string[] = [];
  let start = head;
  let previous = head;
  const flush = (): void => {
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
  };
  for (const page of rest) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    flush();
    start = page;
    previous = page;
  }
  flush();
  return parts.join(', ');
}

function batesLines(
  input: Extract<CenturionToolCall, { name: 'applyBates' }>['input']
): DetailLine[] {
  const first = `${input.prefix}${String(input.startNumber).padStart(input.padWidth, '0')}`;
  return [
    { label: 'First number', value: first },
    { label: 'Prefix', value: input.prefix === '' ? 'None' : input.prefix },
    { label: 'Position', value: POSITION_WORDS[input.position] ?? input.position },
    { label: 'Pages', value: formatPageList(input.pages) },
  ];
}

const LINES: {
  [K in CenturionToolName]: (call: Extract<CenturionToolCall, { name: K }>) => DetailLine[];
} = {
  applyBates: (call) => batesLines(call.input),

  applyWatermark: (call) => [
    { label: 'Text', value: call.input.text },
    { label: 'Direction', value: call.input.orientation === 'diagonal' ? 'Diagonal' : 'Level' },
    { label: 'Strength', value: `${call.input.opacityPct}% (the page stays readable)` },
    { label: 'Pages', value: formatPageList(call.input.pages) },
  ],

  applyExhibitStamp: (call) => [
    { label: 'Label', value: call.input.label },
    {
      label: 'Position',
      value: POSITION_WORDS[call.input.position] ?? call.input.position,
    },
    { label: 'Pages', value: formatPageList(call.input.pages) },
  ],

  applyPageNumbers: (call) => [
    { label: 'Format', value: 'Page 1 of 20' },
    {
      label: 'Position',
      value: POSITION_WORDS[call.input.position] ?? call.input.position,
    },
    { label: 'Pages', value: formatPageList(call.input.pages) },
  ],

  setBookmarks: (call) =>
    call.input.bookmarks.map((node) => ({
      label: node.title,
      value: `page ${node.page}${node.children === undefined ? '' : ` (+${node.children.length} under it)`}`,
    })),

  suggestRedactions: (call) =>
    call.input.terms.map((term) => ({ label: term.reason, value: term.text })),
};

/**
 * The expandable detail under a card's summary. An input main could not narrow
 * would never have reached a card, so a failure here is shown, not hidden.
 */
export function detailLines(name: CenturionToolName, input: unknown): DetailLine[] {
  try {
    const call = validateToolCall(name, input);
    // The lookup and the call agree on the name by construction; the cast is
    // the one place TypeScript cannot see that for itself.
    return (LINES[name] as (value: CenturionToolCall) => DetailLine[])(call);
  } catch (error) {
    return [{ label: 'Could not read the settings', value: String(error) }];
  }
}

/** The status line under a running card, before any page count has arrived. */
export const RUNNING_LABEL = 'Working on the document...';

/** The row of examples shown when tools are on and the conversation is empty. */
export const QUICK_ACTIONS: readonly string[] = [
  'Bates-stamp this production',
  'Suggest redactions',
  'Bookmark the exhibits',
];

/**
 * The tool catalogue Centurion is offered: one definition per tool - the
 * description the model reads, the JSON schema it is held to, and where an
 * approved call runs. Main-side on purpose: the renderer never needs a JSON
 * schema (it gets the validated input on the proposal), and keeping the
 * descriptions next to the schemas means the two cannot drift apart. The
 * protocol that walks a proposed call through confirm-and-run lives in
 * ./centurion-tool-protocol.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { CenturionToolName } from '@shared/types';
import {
  CORNERS,
  CenturionToolInputError,
  EXHIBIT_POSITIONS,
  PAGE_NUMBER_SPOTS,
  SIGNATURE_FIELD_KINDS,
  SIGNATURE_PLACEMENTS,
} from '@shared/centurion-tools';
import {
  BOOKMARK_LEAF,
  BOOKMARK_PAGE,
  BOOKMARK_TITLE,
  PAGES,
  REQUIRED_PAGES,
  listOf,
  object,
  oneOf,
  schema,
  text,
  whole,
} from './centurion-tool-schema';
import type { CenturionToolDefinition } from './centurion-tool-schema';

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
  {
    name: 'addSignatureFields',
    runsIn: 'renderer',
    description:
      'Place e-signature fields on the open document. Use it when the attorney asks to prepare ' +
      'a document for e-signature, or to add signature, date, name, initials, or text fields. ' +
      'The fields land in the E-Sign panel for the attorney to review and send - nothing is ' +
      'emailed by this tool. Anchor each field to EXACT text quoted from the document on that ' +
      'page: signature lines often read "By:", "Signature:", "Name:", "Date:", or a run of ' +
      'underscores - quote the underscores exactly as they appear. Placement: right-of puts ' +
      'the box on the same line to the right of the anchor (the usual choice for "Date:"-style ' +
      'labels); on covers the anchor itself (the choice for an underscore line the person ' +
      'signs over); below and above sit under or over it. A date field fills in automatically ' +
      'when the person signs. Give every signer at least one signature field.',
    inputSchema: schema(
      {
        signers: listOf(
          object(
            {
              name: text('The signer\'s full name, e.g. "Jane Smith".'),
              email: text("The signer's email address."),
            },
            ['name', 'email']
          ),
          'The full signer roster for this request, 1-20 people.'
        ),
        fields: listOf(
          object(
            {
              kind: oneOf(SIGNATURE_FIELD_KINDS, 'What the signer puts in the box.'),
              signerEmail: text('Which signer owns the box - must match an email in signers.'),
              page: whole('The 1-based page the anchor text is on.', 1),
              anchorText: text(
                'Exact text on that page to anchor the box to, quoted exactly as it appears.'
              ),
              occurrence: whole(
                'Which match when the anchor repeats on the page; 1 = first.',
                1,
                50
              ),
              placement: oneOf(SIGNATURE_PLACEMENTS, 'Where the box sits relative to the anchor.'),
              label: text('Prompt shown to the signer for a text field, e.g. "Title".'),
            },
            ['kind', 'signerEmail', 'page', 'anchorText', 'placement']
          ),
          'The boxes to place, 1-100.'
        ),
      },
      ['signers', 'fields']
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

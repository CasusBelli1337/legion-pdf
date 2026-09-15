// A FICTIONAL opposition brief the way another firm's Word template makes one:
// Word's own line numbering (not a header table), Century Schoolbook body,
// Arial headings, two footnotes, a ruled caption table, a signature block, a
// running head, and a proof of service with a ruled service list — the mix an
// opposing-counsel filing arrives with. Printed to PDF by real Word afterwards.
//
//   node qa/word-export/make-filing.mjs <out.docx>
import { writeFileSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeightRule,
  LineNumberRestartFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const BODY_FONT = 'Century Schoolbook';
const HEAD_FONT = 'Arial';
const NIL = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const NO_BORDERS = { top: NIL, bottom: NIL, left: NIL, right: NIL };

const text = (value, extra = {}) => new TextRun({ text: value, font: BODY_FONT, size: 24, ...extra });
const exact = (lines = 1) => ({ line: 480 * lines, lineRule: LineRuleType.EXACT, before: 0, after: 0 });

function body(value, options = {}) {
  return new Paragraph({
    spacing: exact(),
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 720 },
    ...options,
    children: options.children ?? [text(value)],
  });
}

function heading(value) {
  return new Paragraph({
    spacing: exact(),
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: value, font: HEAD_FONT, size: 24, bold: true })],
  });
}

function single(value, extra = {}) {
  return new Paragraph({
    spacing: { line: 240, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
    children: [text(value, extra)],
  });
}

function cell(children, width, borders) {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 0, bottom: 0, left: 80, right: 80 },
  });
}

const attorneyBlock = [
  'DESMOND K. ARBUTHNOT (SBN 176203)',
  'darbuthnot@ferrante-lowe.example',
  'FERRANTE, LOWE & ARBUTHNOT LLP',
  '2010 North First Street, 9th Floor',
  'San Jose, California 95131',
  'Telephone: (408) 555-0177',
  '',
  'Attorneys for Defendant',
  'HALVERSON DYNAMICS, INC.',
].map((line) => single(line));

const caption = new Table({
  layout: TableLayoutType.FIXED,
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680],
  borders: { ...NO_BORDERS, insideHorizontal: NIL, insideVertical: NIL },
  rows: [
    new TableRow({
      height: { value: 480 * 8, rule: HeightRule.EXACT },
      children: [
        cell(
          [
            single('MARGARET OKONKWO-REYES, an individual,'),
            single(''),
            single('Plaintiff,', { }),
            single(''),
            single('     vs.'),
            single(''),
            single('HALVERSON DYNAMICS, INC., a Delaware corporation; and DOES 1 through 20, inclusive,'),
            single(''),
            single('Defendants.'),
          ],
          4680,
          { top: NIL, left: NIL, right: LINE, bottom: LINE }
        ),
        cell(
          [
            single('Case No. 24CV412887'),
            single(''),
            single("DEFENDANT HALVERSON DYNAMICS, INC.'S OPPOSITION TO PLAINTIFF'S MOTION TO COMPEL FURTHER RESPONSES TO SPECIAL INTERROGATORIES, SET ONE", { bold: true }),
            single(''),
            single('Date:      November 14, 2026'),
            single('Time:      9:00 a.m.'),
            single('Dept.:     7'),
            single('Judge:     Hon. Dolores A. Marchetti'),
          ],
          4680,
          NO_BORDERS
        ),
      ],
    }),
  ],
});

const argument = [
  heading('I.  INTRODUCTION'),
  body(
    "Plaintiff's motion treats twenty-two interrogatories as if they were one. They are not. Halverson Dynamics, Inc. (\"Halverson\") answered the four interrogatories that asked for facts it possesses, objected to the eleven that ask it to identify every employee who ever \"reviewed, considered, or discussed\" a component in a product line it has sold for nine years, and offered, twice in writing, to answer narrowed versions of the rest.",
    { children: [text("Plaintiff's motion treats twenty-two interrogatories as if they were one. They are not. Halverson Dynamics, Inc. (\"Halverson\") answered the four interrogatories that asked for facts it possesses, objected to the eleven that ask it to identify every employee who ever \"reviewed, considered, or discussed\" a component in a product line it has sold for nine years,"), new FootnoteReferenceRun(1), text(" and offered, twice in writing, to answer narrowed versions of the rest.")] }
  ),
  body(
    'Plaintiff rejected both offers and filed this motion. The Court should deny it, or at most order responses to the narrowed interrogatories Halverson has already agreed to answer, and should deny the request for sanctions.'
  ),
  heading('II.  ARGUMENT'),
  new Paragraph({
    spacing: exact(),
    children: [new TextRun({ text: 'A.   The Interrogatories Are Overbroad as Written.', font: HEAD_FONT, size: 24, bold: true })],
  }),
  body(
    'An interrogatory must be "full and complete in and of itself" and may not be "unduly burdensome or oppressive." (Code Civ. Proc., §§ 2030.060, subd. (d), 2030.090, subd. (b).) Special Interrogatory No. 3 asks Halverson to "IDENTIFY every PERSON who reviewed, considered, evaluated, tested, or discussed the WIRING HARNESS at any time." The defined term "WIRING HARNESS" covers every harness assembly in every Model 300-series unit since 2017. Halverson has manufactured roughly 140,000 of them.'
  ),
  body(
    'Plaintiff\'s reply to this objection was to propose limiting the interrogatory to the eleven months before her purchase — which Halverson accepted in writing on August 26, 2026. (Declaration of Desmond K. Arbuthnot ("Arbuthnot Decl.") ¶ 4, Ex. 1.) The motion does not mention that letter.',
    { children: [text('Plaintiff\'s reply to this objection was to propose limiting the interrogatory to the eleven months before her purchase — which Halverson accepted in writing on August 26, 2026. (Declaration of Desmond K. Arbuthnot ("Arbuthnot Decl.") ¶ 4, Ex. 1.) The motion does not mention that letter.'), new FootnoteReferenceRun(2)] }
  ),
  new Paragraph({
    spacing: exact(),
    children: [new TextRun({ text: 'B.   Sanctions Are Not Warranted.', font: HEAD_FONT, size: 24, bold: true })],
  }),
  body(
    'Sanctions may not be imposed where the party opposing the motion "acted with substantial justification." (Code Civ. Proc., § 2030.300, subd. (d).) A party that answers what it can, objects with reasons, and agrees in writing to the narrowing the propounding party itself proposed has acted with substantial justification by any measure.'
  ),
  heading('III.  CONCLUSION'),
  body(
    'Halverson respectfully requests that the Court deny the motion, or in the alternative order further responses only to Special Interrogatories Nos. 3, 4, 7, and 12 as narrowed in the parties\' correspondence of August 26, 2026, and deny sanctions.'
  ),
  new Paragraph({ spacing: exact(), children: [text('')] }),
  new Paragraph({ spacing: exact(), children: [text('Dated: October 30, 2026'), new TextRun({ text: '\tFERRANTE, LOWE & ARBUTHNOT LLP', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
  new Paragraph({ spacing: exact(), children: [text('')] }),
  new Paragraph({ spacing: exact(), children: [new TextRun({ text: '\tBy:  ______________________________', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
  new Paragraph({ spacing: exact(), children: [new TextRun({ text: '\t        Desmond K. Arbuthnot', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
  new Paragraph({ spacing: exact(), children: [new TextRun({ text: '\t        Attorneys for Defendant', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
];

const serviceList = new Table({
  layout: TableLayoutType.FIXED,
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [3600, 3600, 2160],
  borders: { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE },
  rows: [
    ['Party served', 'Address', 'Method'],
    ['Priya N. Vanterpool, Esq.\nVanterpool & Ashe LLP', '1550 The Alameda, Suite 300\nSan Jose, CA 95126', 'Electronic service'],
    ['Clerk of the Court\nDept. 7', '191 North First Street\nSan Jose, CA 95113', 'Courtesy copy by mail'],
  ].map(
    (cells, rowIndex) =>
      new TableRow({
        height: { value: 480 * 2, rule: HeightRule.EXACT },
        children: cells.map((value, column) =>
          cell(
            value.split('\n').map((line) => single(line, rowIndex === 0 ? { bold: true } : {})),
            [3600, 3600, 2160][column],
            { top: LINE, bottom: LINE, left: LINE, right: LINE }
          )
        ),
      })
  ),
});

const proofOfService = [
  new Paragraph({ children: [new PageBreak()], spacing: { line: 1, lineRule: LineRuleType.EXACT, before: 0, after: 0 } }),
  heading('PROOF OF SERVICE'),
  body(
    'I am employed in the County of Santa Clara, State of California. I am over the age of eighteen and not a party to this action. My business address is 2010 North First Street, 9th Floor, San Jose, California 95131.'
  ),
  body(
    "On October 30, 2026, I served the foregoing DEFENDANT HALVERSON DYNAMICS, INC.'S OPPOSITION TO PLAINTIFF'S MOTION TO COMPEL FURTHER RESPONSES TO SPECIAL INTERROGATORIES, SET ONE on the interested parties in this action as follows:"
  ),
  serviceList,
  new Paragraph({ spacing: exact(), children: [text('')] }),
  body(
    'I declare under penalty of perjury under the laws of the State of California that the foregoing is true and correct. Executed on October 30, 2026, at San Jose, California.'
  ),
  new Paragraph({ spacing: exact(), children: [text('')] }),
  new Paragraph({ spacing: exact(), children: [new TextRun({ text: '\t______________________________', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
  new Paragraph({ spacing: exact(), children: [new TextRun({ text: '\t        Rosalind Achebe-Marr', font: BODY_FONT, size: 24 })], tabStops: [{ type: 'left', position: 5040 }] }),
];

const doc = new Document({
  creator: 'Ferrante, Lowe & Arbuthnot LLP',
  styles: { default: { document: { run: { font: BODY_FONT, size: 24 } } } },
  footnotes: {
    1: { children: [new Paragraph({ children: [new TextRun({ text: ' Interrogatories Nos. 3 through 9, 12, 14, and 17 through 22 all incorporate the same defined terms. (Arbuthnot Decl., Ex. 2.)', font: BODY_FONT, size: 20 })] })] },
    2: { children: [new Paragraph({ children: [new TextRun({ text: ' The letter is attached as Exhibit 1 to the Arbuthnot Declaration filed with this opposition.', font: BODY_FONT, size: 20 })] })] },
  },
  sections: [
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1080, left: 2160, right: 1440, header: 540, footer: 540 } },
        lineNumbers: { countBy: 1, restart: LineNumberRestartFormat.NEW_PAGE, distance: 720 },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Okonkwo-Reyes v. Halverson Dynamics, Inc. — Case No. 24CV412887', font: BODY_FONT, size: 18 })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 4 } },
              children: [new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 20 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "DEFENDANT'S OPPOSITION TO MOTION TO COMPEL FURTHER RESPONSES TO SPECIAL INTERROGATORIES, SET ONE", font: BODY_FONT, size: 16 })],
            }),
          ],
        }),
      },
      children: [
        ...attorneyBlock,
        new Paragraph({ spacing: exact(), alignment: AlignmentType.CENTER, children: [text('SUPERIOR COURT OF THE STATE OF CALIFORNIA')] }),
        new Paragraph({ spacing: exact(), alignment: AlignmentType.CENTER, children: [text('COUNTY OF SANTA CLARA')] }),
        caption,
        new Paragraph({ spacing: exact(), children: [text('')] }),
        ...argument,
        ...proofOfService,
      ],
    },
  ],
});

const out = process.argv[2];
writeFileSync(out, await Packer.toBuffer(doc));
console.error('wrote', out);

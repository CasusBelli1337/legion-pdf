// A FICTIONAL deposition transcript the way court-reporting software sets one:
// Courier New 12, 25 numbered lines per page (numbers in a header table, as
// the reporters' templates do), every transcript line its own paragraph on an
// exact 24-point grid, "Page N" at the top, the reporting firm at the foot,
// Q./A. blocks and colloquy — then a certificate page without line numbers.
// Printed to PDF by real Word afterwards.
//
//   node qa/word-export/make-deposition.mjs <out.docx>
import { writeFileSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const FONT = 'Courier New';
const LINES = 25;
const PITCH = 480;
const NIL = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' };
const RULE = { style: BorderStyle.SINGLE, size: 6, color: '000000' };

const mono = (value) => new TextRun({ text: value, font: FONT, size: 24 });
const line = (value) =>
  new Paragraph({
    spacing: { line: PITCH, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
    children: [mono(value)],
  });

/** The number column: one paragraph, 25 numbers separated by line breaks. */
function numberHeader() {
  const runs = Array.from({ length: LINES }, (_unused, index) =>
    new TextRun({ text: String(index + 1), font: FONT, size: 24, ...(index > 0 ? { break: 1 } : {}) })
  );
  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 720 + 8640, type: WidthType.DXA },
    columnWidths: [720, 8640],
    indent: { size: -900, type: WidthType.DXA },
    borders: { top: NIL, bottom: NIL, left: NIL, right: NIL, insideHorizontal: NIL, insideVertical: RULE },
    rows: [
      new TableRow({
        height: { value: 300 + PITCH * LINES, rule: HeightRule.EXACT },
        children: [
          new TableCell({
            width: { size: 720, type: WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 120 },
            borders: { top: NIL, bottom: NIL, left: NIL, right: RULE },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { line: PITCH, lineRule: LineRuleType.EXACT, before: 300, after: 0 },
                children: runs,
              }),
            ],
          }),
          new TableCell({
            width: { size: 8640, type: WidthType.DXA },
            borders: { top: NIL, bottom: NIL, left: NIL, right: NIL },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { line: 240, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
                children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 24 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  return new Header({ children: [table] });
}

const testimony = [
  '',
  '            SAN JOSE, CALIFORNIA; THURSDAY, AUGUST 6, 2026',
  '                          10:04 A.M.',
  '',
  '                    KENJI M. STRAND-OYELARAN,',
  'having been first duly sworn, was examined and testified',
  'as follows:',
  '',
  '                    EXAMINATION',
  'BY MS. VANTERPOOL:',
  '     Q.   Good morning, Mr. Strand-Oyelaran.  Would you',
  'state and spell your full name for the record, please.',
  '     A.   Kenji Makoto Strand-Oyelaran.  K-E-N-J-I,',
  'M-A-K-O-T-O, S-T-R-A-N-D, hyphen, O-Y-E-L-A-R-A-N.',
  '     Q.   And what is your position at Halverson',
  'Dynamics?',
  '     A.   I am the senior reliability engineer for the',
  '300-series product line.',
  '     Q.   How long have you held that position?',
  '     A.   Since March of 2022.',
  '     Q.   I want to direct your attention to what has',
  'been marked as Exhibit 14.  Do you recognize it?',
  '     A.   Yes.  This is the internal recall notice that',
  'went to distributors in May of 2024.',
  '     Q.   Did you participate in drafting it?',
  '          MR. ARBUTHNOT:  Objection.  Vague as to',
  '"participate."',
  '          MS. VANTERPOOL:  You can answer.',
  '          THE WITNESS:  I reviewed the technical',
  'description in the second paragraph.  I did not write',
  'the rest of it.',
  'BY MS. VANTERPOOL:',
  '     Q.   The second paragraph says the insulation',
  '"degrades under sustained operation above 85 percent',
  'relative humidity."  Is that an accurate description of',
  'what your testing showed?',
  '     A.   It is a fair summary.  The full test report',
  'has the curves.',
  '     Q.   When was the full test report completed?',
  '     A.   The final version is dated January 19, 2024.',
  '     Q.   And before January 19, 2024, had you or anyone',
  'on your team reported the insulation issue to anyone',
  'outside the engineering group?',
  '          MR. ARBUTHNOT:  Objection.  Calls for',
  'speculation as to what others may have done.',
  '          MS. VANTERPOOL:  I asked about him and his',
  'team.',
  '          MR. ARBUTHNOT:  Same objection.  Go ahead.',
  '          THE WITNESS:  I sent a summary to the product',
  'manager in November of 2023.',
  'BY MS. VANTERPOOL:',
  '     Q.   Who was the product manager in November of',
  '2023?',
  '     A.   Beatriz Anand-Whitlock.',
  '     Q.   Was that summary in writing?',
  '     A.   It was an email.',
  '     Q.   Did she respond?',
  '     A.   She asked whether the issue affected units',
  'already in the field.  I said that it did.',
  '     Q.   What happened after that?',
  '     A.   I was asked to run the extended humidity',
  'protocol, which is what became the January report.',
  '          MS. VANTERPOOL:  Let\'s take a short break.',
  '          THE VIDEOGRAPHER:  Going off the record at',
  '10:41 a.m.',
  '          (Recess taken.)',
  '          THE VIDEOGRAPHER:  We are back on the record',
  'at 10:52 a.m.',
  'BY MS. VANTERPOOL:',
  '     Q.   Before the break you mentioned the extended',
  'humidity protocol.  Can you describe it?',
  '     A.   Units run continuously in a chamber held at',
  '90 percent relative humidity for 1,500 hours, with',
  'harness temperature logged every ten minutes.',
];

const certificate = [
  '',
  '',
  '              REPORTER\'S CERTIFICATE',
  '',
  'I, Anneliese Okafor-Brandt, CSR No. 14022, a Certified',
  'Shorthand Reporter in and for the State of California,',
  'do hereby certify:',
  '',
  'That the foregoing deposition was taken before me at the',
  'time and place therein set forth; that the witness was',
  'duly sworn by me; that the testimony was reported',
  'stenographically by me and thereafter transcribed under',
  'my direction; and that the foregoing is a true record of',
  'the testimony given.',
  '',
  'I further certify that I am not of counsel or attorney',
  'for any of the parties, nor in any way interested in the',
  'outcome of this action.',
  '',
  'Dated: August 20, 2026',
  '',
  '',
  '                    ______________________________',
  '                    Anneliese Okafor-Brandt, CSR 14022',
];

const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'BAY AREA COURT REPORTERS  (408) 555-0199', font: FONT, size: 20 })],
    }),
  ],
});

const doc = new Document({
  creator: 'Bay Area Court Reporters',
  styles: { default: { document: { run: { font: FONT, size: 24 } } } },
  sections: [
    {
      properties: {
        // Line 1 of the body lands on number 1: the body's fixed top (780 twips)
        // is the header distance (480) plus the number column's space-before
        // (300); the bottom margin leaves room for exactly 25 lines.
        page: { size: { width: 12240, height: 15840 }, margin: { top: -780, bottom: 3060, left: 1800, right: 1080, header: 480, footer: 540 } },
      },
      headers: { default: numberHeader() },
      footers: { default: footer },
      children: testimony.map(line),
    },
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1200, left: 1800, right: 1080, header: 480, footer: 540 } },
      },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], font: FONT, size: 24 })] })] }) },
      footers: { default: footer },
      children: certificate.map(line),
    },
  ],
});

const out = process.argv[2];
writeFileSync(out, await Packer.toBuffer(doc));
console.error('wrote', out);

#!/usr/bin/env python3
"""Fills a Legion California pleading template with a FICTIONAL motion.

The result is what Arthur's own tools produce before Word prints it to PDF:
a caption on 28-line pleading paper, numbered headings, double-spaced body,
a single-spaced block quote, a signature block, and the footer title. Every
party, attorney, court department, and case number here is invented.

    python3 qa/word-export/fill-pleading-template.py <template.docx> <out.docx>

The template is Legion's private `document_drafter/templates/mpa-builder/ca.docx`
(not part of this repository); only the generated PDF is committed.
"""
import copy
import sys

import docx
from docx.enum.text import WD_BREAK

FIELDS = {
    "CASE_CAPTION": (
        "PRIYA N. VANTERPOOL (SBN 298114)\n"
        "priya@vanterpool-ashe.example\n"
        "VANTERPOOL & ASHE LLP\n"
        "1550 The Alameda, Suite 300\n"
        "San Jose, California 95126\n"
        "Telephone: (408) 555-0142"
    ),
    "ATTORNEY_FOR_PARTY": "Attorneys for Plaintiff",
    "CLIENT_NAME": "MARGARET OKONKWO-REYES",
    "COURT_NAME": "SUPERIOR COURT OF THE STATE OF CALIFORNIA",
    "COUNTY": "COUNTY OF SANTA CLARA",
    "PROS_NAME": "MARGARET OKONKWO-REYES, an individual",
    "PROS_LABEL": "Plaintiff",
    "DEF_NAME": "HALVERSON DYNAMICS, INC., a Delaware corporation; and DOES 1 through 20, inclusive",
    "DEF_LABEL": "Defendants",
    "CASE_NUMBER": "Case No. 24CV412887",
    "DOC_TITLE": (
        "PLAINTIFF'S MEMORANDUM OF POINTS AND AUTHORITIES IN SUPPORT OF MOTION "
        "TO COMPEL FURTHER RESPONSES TO SPECIAL INTERROGATORIES, SET ONE"
    ),
    "DATE": "Dated: October 2, 2026",
    "FIRM_NAME": "VANTERPOOL & ASHE LLP",
    "ATTORNEY_NAME": "Priya N. Vanterpool",
    "FOOTER": "MPA ISO MOTION TO COMPEL FURTHER RESPONSES TO SPECIAL INTERROGATORIES, SET ONE",
}

HEARING = {
    "Date:": "Date:\tNovember 14, 2026",
    "Time:": "Time:\t9:00 a.m.",
    "Dept.": "Dept.:\t7 (Hon. Dolores A. Marchetti)",
    "Action filed:": "Action filed:\tMarch 3, 2025",
    "Trial Date:": "Trial Date:\tNone set",
}

# Style ids → the names python-docx looks styles up by.
STYLE_NAMES = {
    "Pleading2L1": "Pleading2_L1",
    "Pleading2L2": "Pleading2_L2",
    "BodyText": "Body Text",
    "Quote": "Quote",
}

# (style id, text). Styles are the template's own; "Quote" is single-spaced.
BODY = [
    ("Pleading2L1", "INTRODUCTION"),
    ("BodyText", "Plaintiff Margaret Okonkwo-Reyes served her Special Interrogatories, Set One, on defendant Halverson Dynamics, Inc. on June 9, 2026. Halverson answered on July 14, 2026 with objections to every one of the twenty-two interrogatories and substantive responses to four. The responses that were given are evasive, and the objections are boilerplate. After two meet-and-confer letters and a telephone conference, Halverson has agreed to supplement nothing."),
    ("BodyText", "This motion asks the Court to order further responses to Special Interrogatories Nos. 3 through 9, 12, 14, and 17 through 22 within twenty days, without objection, under Code of Civil Procedure section 2030.300. The interrogatories seek the identity of the engineers who reviewed the wiring harness at issue, the dates of that review, and the documents that record it. Nothing about those questions is privileged, burdensome, or unclear."),
    ("Pleading2L1", "STATEMENT OF FACTS"),
    ("BodyText", "Ms. Okonkwo-Reyes purchased a Halverson Model 340 industrial dehumidifier for her commercial bakery in Los Gatos in February 2024. On the night of September 18, 2024, the unit overheated and started a fire that destroyed the bakery's kitchen and two adjacent storerooms. The fire investigator retained by her insurer traced the ignition point to the unit's main wiring harness. (Declaration of Priya N. Vanterpool (\"Vanterpool Decl.\") ¶ 3, Ex. A.)"),
    ("BodyText", "Halverson's own recall notice, issued four months earlier to distributors but never to end users, describes the problem in terms that could not be plainer:"),
    ("Quote", "\"Units manufactured between March 2023 and January 2024 may contain a wiring harness whose insulation degrades under sustained operation above 85% relative humidity. Distributors should quarantine affected inventory pending replacement of the harness assembly.\" (Vanterpool Decl., Ex. B at p. 2.)"),
    ("BodyText", "The interrogatories at issue ask who at Halverson evaluated the harness before and after that notice, when they did so, and what they wrote down. Halverson objected that each question is \"vague, ambiguous, overbroad, unduly burdensome, and seeks information protected by the attorney-client privilege and the work product doctrine,\" and then answered only that \"responsive documents, if any, will be produced.\" (Vanterpool Decl., Ex. C.) No privilege log was served."),
    ("BodyText", "Plaintiff's counsel wrote to Halverson's counsel on July 28 and again on August 19, 2026, identifying each deficient response and proposing narrowed language for the two interrogatories Halverson had called overbroad. (Vanterpool Decl., Exs. D, E.) Counsel conferred by telephone on September 3, 2026. Halverson declined to supplement any response and declined to serve a privilege log. (Id. ¶¶ 8–9.)"),
    ("Pleading2L1", "ARGUMENT"),
    ("Pleading2L2", "Halverson's Boilerplate Objections Are Not a Response."),
    ("BodyText", "A party responding to interrogatories must answer each one \"as completely and straightforwardly as the information reasonably available to the responding party permits.\" (Code Civ. Proc., § 2030.220, subd. (a).) An objection must be stated with particularity. (Code Civ. Proc., § 2030.240, subd. (b).) A responding party that objects on the basis of privilege must identify the information withheld with enough detail to let the propounding party evaluate the claim. (Code Civ. Proc., § 2031.240, subd. (c)(1); Williams v. Superior Court (2017) 3 Cal.5th 531, 557.)"),
    ("BodyText", "Halverson's responses meet none of these requirements. The same five objections are recited, word for word, to twenty-two different questions, including questions that ask for nothing more than a name and a date. An objection that an interrogatory asking for the name of the engineer who signed a test report is \"vague\" is not made in good faith. And a privilege objection unaccompanied by any log, and unsupported by any explanation of what communication is claimed to be privileged, is no objection at all."),
    ("Pleading2L2", "The Interrogatories Seek Information Directly Relevant to Notice and Defect."),
    ("BodyText", "Discovery may be had of any matter, not privileged, that is relevant to the subject matter of the action, if the matter is itself admissible or appears reasonably calculated to lead to the discovery of admissible evidence. (Code Civ. Proc., § 2017.010.) Plaintiff's strict liability and negligence claims both turn on what Halverson knew about the harness, and when. The engineers who reviewed the harness, the dates of their review, and the reports they wrote are the core of that inquiry. Halverson has not explained how any of it could be irrelevant."),
    ("Pleading2L2", "Monetary Sanctions Are Mandatory."),
    ("BodyText", "The Court \"shall impose a monetary sanction\" against a party who unsuccessfully opposes a motion to compel further responses to interrogatories unless it finds that the party acted with substantial justification or that other circumstances make the sanction unjust. (Code Civ. Proc., § 2030.300, subd. (d).) Halverson's refusal to supplement a single response, or even to serve a privilege log, after two written requests and a telephone conference, was not substantially justified. Plaintiff requests sanctions of $3,460, representing 7.5 hours at $440 per hour plus the $60 filing fee. (Vanterpool Decl. ¶ 11.)"),
    ("Pleading2L1", "CONCLUSION"),
    ("BodyText", "For the reasons stated, Plaintiff respectfully requests that the Court order Halverson Dynamics, Inc. to serve further, complete, verified responses to Special Interrogatories Nos. 3 through 9, 12, 14, and 17 through 22, without objection, within twenty days of the Court's order, and that the Court impose monetary sanctions of $3,460 against Halverson and its counsel, jointly and severally."),
]


def set_text(paragraph, text):
    """Replace a paragraph's text, keeping the first run's formatting; '\n' = line break."""
    runs = paragraph.runs
    if not runs:
        runs = [paragraph.add_run("")]
    for run in runs[1:]:
        run._element.getparent().remove(run._element)
    first = runs[0]
    first.text = ""
    for index, line in enumerate(text.split("\n")):
        if index > 0:
            first.add_break(WD_BREAK.LINE)
        first.add_text(line)


def fill_placeholders(paragraph):
    text = paragraph.text
    if "{{" not in text and not any(text.startswith(key) for key in HEARING):
        return
    for key, value in HEARING.items():
        if text.startswith(key):
            set_text(paragraph, value)
            return
    for key, value in FIELDS.items():
        text = text.replace("{{" + key + "}}", value)
    set_text(paragraph, text)


def every_paragraph(document):
    for paragraph in document.paragraphs:
        yield paragraph
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    yield paragraph
    for section in document.sections:
        for part in (section.footer, section.first_page_footer, section.even_page_footer):
            for paragraph in part.paragraphs:
                yield paragraph
            for table in part.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for paragraph in cell.paragraphs:
                            yield paragraph


def insert_body(document):
    anchor = next(p for p in document.paragraphs if "{{START_HERE}}" in p.text)
    for style, text in BODY:
        new = copy.deepcopy(anchor._element)
        anchor._element.addprevious(new)
        paragraph = docx.text.paragraph.Paragraph(new, anchor._parent)
        paragraph.style = document.styles[STYLE_NAMES[style]]
        # The template's top-level heading numbering has no suffix: the tab is the text's.
        set_text(paragraph, ("\t" + text) if style == "Pleading2L1" else text)
    anchor._element.getparent().remove(anchor._element)


def main(template, out):
    document = docx.Document(template)
    insert_body(document)
    for paragraph in every_paragraph(document):
        fill_placeholders(paragraph)
    leftovers = [p.text for p in every_paragraph(document) if "{{" in p.text]
    if leftovers:
        raise SystemExit(f"placeholders left unfilled: {leftovers}")
    document.save(out)
    print(f"wrote {out}: {len(BODY)} body paragraphs")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

/**
 * Scanned pages' pictures after the last page of text, one full-page picture
 * per scanned page, when the attorney chose `scanPictures: 'appendix'`.
 *
 * One SECTION per picture rather than one page of a single section: each scan
 * keeps its own paper size (a letter deposition with one legal-size exhibit
 * stays honest), the margins are zero so the picture lands edge to edge, and a
 * section break guarantees Word starts a new sheet without a page-break
 * paragraph that could itself be edited away.
 *
 * The first section carries the heading, so its picture is fitted to the sheet
 * LESS the heading's band. Measured in real Word (2026-09-15): reserving the
 * band only as a top margin, and letting the heading have a line of its own on
 * top of it, cost the band twice and pushed the first picture onto a sheet of
 * its own.
 */

import {
  AlignmentType,
  LineRuleType,
  PageOrientation,
  Paragraph as DocxParagraph,
  TextRun,
} from 'docx';
import type { ISectionOptions } from 'docx';
import type { LayoutImage, PageLayout, ScanPictureMode } from '@shared/types';
import { fullPageImageRun } from './docx-image';
import { scannedPictureOf } from './images';
import { twips } from './model';
import { pageSizeOf } from './page-setup';

export const SCAN_APPENDIX_HEADING = 'Scanned pages';

/**
 * Points the heading takes off the first sheet: its own exact line plus enough
 * slack that Word never decides the picture below it needs a new page.
 */
const HEADING_BAND = 36;
const HEADING_LINE_PT = 24;
const HEADING_SIZE_PT = 12;

interface Scan {
  layout: PageLayout;
  image: LayoutImage;
}

function heading(): DocxParagraph {
  return new DocxParagraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: twips(HEADING_LINE_PT), lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: SCAN_APPENDIX_HEADING, bold: true, size: HEADING_SIZE_PT * 2 })],
  });
}

/** The picture at its largest inside the room the sheet leaves it. */
function picture(scan: Scan, topBandPt: number): DocxParagraph {
  const size = pageSizeOf(scan.layout);
  const room = { width: size.width, height: size.height - topBandPt };
  const rect = scan.image.rect;
  const scale = Math.min(room.width / rect.width, room.height / rect.height);
  return new DocxParagraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [fullPageImageRun(scan.image.png, rect.width * scale, rect.height * scale)],
  });
}

function sectionFor(scan: Scan, first: boolean): ISectionOptions {
  const size = pageSizeOf(scan.layout);
  const topBandPt = first ? HEADING_BAND : 0;
  return {
    properties: {
      page: {
        size: {
          width: twips(Math.min(size.width, size.height)),
          height: twips(Math.max(size.width, size.height)),
          orientation:
            size.width > size.height ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
      },
    },
    children: first ? [heading(), picture(scan, topBandPt)] : [picture(scan, topBandPt)],
  };
}

export function scanAppendixSections(
  layouts: readonly PageLayout[],
  mode: ScanPictureMode
): ISectionOptions[] {
  if (mode !== 'appendix') return [];
  const scans = layouts.flatMap((layout) => {
    const image = scannedPictureOf(layout);
    return image === null ? [] : [{ layout, image }];
  });
  return scans.map((scan, index) => sectionFor(scan, index === 0));
}

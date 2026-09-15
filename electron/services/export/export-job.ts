/**
 * What the Word exporter is handed. The job is the export registry's own
 * (`./exporter.ts`), so every format shares one shape; the context is the
 * one renderer round-trip Word needs — page layouts — so the exporter's tests
 * fake exactly that and nothing else. A function taking this narrower context
 * is still a valid `Exporter` for the registry, whose context carries more.
 */

import type { ExportResult } from '@shared/types';
import type { ExportJob, ExporterContext } from './exporter';

export type { ExportJob };

export type ExportContext = Pick<
  ExporterContext,
  'requestLayout' | 'recognizeText' | 'adopt' | 'closeDoc'
> &
  Partial<Pick<ExporterContext, 'requestRaster'>>;

export type Exporter = (job: ExportJob, context: ExportContext) => Promise<ExportResult>;

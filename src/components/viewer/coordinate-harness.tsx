/**
 * Development-only proof that the ViewerApi coordinate contract holds against
 * the real rendered page — the unit tests cover the maths, this covers the
 * wiring. It zooms the live viewer to three levels and round-trips points
 * through clientToPdf / pdfToClient at each one.
 */

import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useViewerApi, useViewerController } from './viewer-api';
import type { ViewerController } from './viewer-controller';
import type { ViewerApi } from './viewer-types';

const ZOOM_LEVELS = [0.5, 1, 2.75];
const TOLERANCE_PX = 0.5;

interface CheckResult {
  zoom: number;
  worstErrorPx: number;
  pdfPoint: string;
  passed: boolean;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRender(scaleOf: () => number | null, zoom: number): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (scaleOf() === zoom) return;
    await wait(50);
  }
}

/** Round-trip three points on the current page at one zoom level. */
async function checkZoom(
  api: ViewerApi,
  controller: ViewerController,
  zoom: number
): Promise<CheckResult | null> {
  const page = api.currentPage;
  api.setZoom(zoom);
  await waitForRender(() => controller.getGeometry(page)?.scale ?? null, zoom);
  const rect = controller.pageRect(page);
  if (rect === null) return null;

  let worst = 0;
  let sample = '';
  for (const fraction of [0.1, 0.5, 0.9]) {
    const probe = { x: rect.left + rect.width * fraction, y: rect.top + rect.height * fraction };
    const pdf = api.clientToPdf(page, probe);
    const back = pdf === null ? null : api.pdfToClient(page, pdf);
    if (pdf === null || back === null) continue;
    worst = Math.max(worst, Math.abs(back.x - probe.x), Math.abs(back.y - probe.y));
    sample = `${pdf.x.toFixed(1)}, ${pdf.y.toFixed(1)}`;
  }
  return { zoom, worstErrorPx: worst, pdfPoint: sample, passed: worst <= TOLERANCE_PX };
}

function ResultLine({ result }: { result: CheckResult }) {
  return (
    <li className="readout text-text-secondary">
      {Math.round(result.zoom * 100)}% - round trip within {result.worstErrorPx.toFixed(4)} px -
      centre point ({result.pdfPoint}) pt -{' '}
      <span className={result.passed ? 'text-success' : 'text-danger'}>
        {result.passed ? 'PASS' : 'FAIL'}
      </span>
    </li>
  );
}

export function CoordinateHarness({ onClose }: { onClose(): void }) {
  const api = useViewerApi();
  const controller = useViewerController();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [isRunning, setRunning] = useState(false);

  const run = useCallback(async (): Promise<void> => {
    if (api === null) return;
    setRunning(true);
    setResults([]);
    const startingZoom = api.zoom;
    for (const zoom of ZOOM_LEVELS) {
      const result = await checkZoom(api, controller, zoom);
      if (result !== null) setResults((previous) => [...previous, result]);
    }
    api.setZoom(startingZoom);
    setRunning(false);
  }, [api, controller]);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-armory-border bg-armory-elevated px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="readout text-text-muted">Coordinate check</span>
        <button
          type="button"
          className="rounded-md bg-armory-interactive px-2 py-1 text-xs text-text-primary disabled:opacity-50"
          onClick={() => void run()}
          disabled={isRunning || api === null}
        >
          {isRunning ? 'Checking...' : 'Run at 50%, 100%, 275%'}
        </button>
        {isRunning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-500" />}
        <button
          type="button"
          className="ml-auto text-text-muted hover:text-text-primary"
          onClick={onClose}
          aria-label="Close coordinate check"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {results.map((result) => (
          <ResultLine key={result.zoom} result={result} />
        ))}
      </ul>
    </div>
  );
}

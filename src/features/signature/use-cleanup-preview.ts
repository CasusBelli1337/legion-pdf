/**
 * The before/after the import dialog shows, kept out of the component.
 *
 * Two effects, on purpose: decoding the file happens once, and re-cleaning
 * happens whenever the toggle or the slider moves. The clean-up runs on a short
 * delay so dragging the slider does not re-thresholding a ten-megapixel photo on
 * every pixel of travel, and every object URL is revoked when it is replaced —
 * a preview that leaked one per slider tick would hold the whole image each
 * time.
 */

import { useEffect, useRef, useState } from 'react';
import { decodeImageFile, previewUrl } from './cleanup-canvas';
import {
  cleanByDefault,
  cleanSignature,
  DEFAULT_SENSITIVITY,
  type Pixels,
} from './signature-cleanup';

/** Slider settle time before the pipeline runs again, in milliseconds. */
const RECLEAN_DELAY = 120;

export interface CleanupPreview {
  loading: boolean;
  error: string | null;
  originalUrl: string | null;
  cleanedUrl: string | null;
  /** The pixels to import, or null when the attorney turned clean-up off. */
  cleaned: Pixels | null;
  clean: boolean;
  setClean(on: boolean): void;
  sensitivity: number;
  setSensitivity(value: number): void;
}

function useDecodedImage(file: File): {
  source: Pixels | null;
  originalUrl: string | null;
  error: string | null;
  clean: boolean;
  setClean(on: boolean): void;
} {
  const [source, setSource] = useState<Pixels | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clean, setClean] = useState(true);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const pixels = await decodeImageFile(file);
        url = await previewUrl(pixels);
        if (cancelled) return;
        setSource(pixels);
        setOriginalUrl(url);
        setClean(cleanByDefault(file.type, pixels));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    })();
    return () => {
      cancelled = true;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [file]);

  return { source, originalUrl, error, clean, setClean };
}

interface CleanedImage {
  pixels: Pixels;
  url: string;
}

export function useCleanupPreview(file: File): CleanupPreview {
  const { source, originalUrl, error, clean, setClean } = useDecodedImage(file);
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [result, setResult] = useState<CleanedImage | null>(null);
  // The URL currently on screen. Held in a ref and revoked only when it is
  // REPLACED, so the previous preview stays visible while the next one is being
  // computed rather than blinking out for the length of the settle delay.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (source === null || !clean) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const pixels = cleanSignature(source, sensitivity);
      void previewUrl(pixels).then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (shown.current !== null) URL.revokeObjectURL(shown.current);
        shown.current = url;
        setResult({ pixels, url });
      });
    }, RECLEAN_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clean, sensitivity, source]);

  useEffect(
    () => () => {
      if (shown.current !== null) URL.revokeObjectURL(shown.current);
    },
    []
  );

  return {
    loading: source === null && error === null,
    error,
    originalUrl,
    cleanedUrl: clean ? (result?.url ?? null) : null,
    cleaned: clean ? (result?.pixels ?? null) : null,
    clean,
    setClean,
    sensitivity,
    setSensitivity,
  };
}

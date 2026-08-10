/// <reference types="vite/client" />

import type { LibrariusBridge } from '@shared/bridge';

declare global {
  interface Window {
    /** The typed IPC bridge exposed by electron/preload.ts. */
    readonly librarius: LibrariusBridge;
  }
}

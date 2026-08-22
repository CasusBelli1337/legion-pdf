/**
 * Hand-written types for @jspawn/qpdf-wasm, which ships none. Only the slice
 * of the Emscripten module surface this codebase touches is declared.
 *
 * The WebAssembly namespace below exists because the node tsconfig loads no
 * DOM lib and Node's own types do not declare it; Node the runtime has had
 * the global since v8. Only what qpdf.ts calls is declared.
 */
declare namespace WebAssembly {
  type Imports = Record<string, Record<string, unknown>>;

  interface Instance {
    readonly exports: Record<string, unknown>;
  }

  interface WebAssemblyInstantiatedSource {
    readonly instance: Instance;
  }

  function instantiate(
    bytes: ArrayBufferView | ArrayBuffer,
    imports?: Imports
  ): Promise<WebAssemblyInstantiatedSource>;
}

declare module '@jspawn/qpdf-wasm/qpdf.js' {
  interface QpdfFileSystem {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  }

  export interface QpdfModule {
    callMain(args: string[]): number;
    FS: QpdfFileSystem;
  }

  export interface QpdfInitOptions {
    noInitialRun?: boolean;
    /**
     * Standard Emscripten hook that bypasses the glue's own wasm loading —
     * required here because the bundled loader predates Node's global fetch
     * and misdetects the environment. Call `done` with the instance; the
     * return value is ignored when instantiation is asynchronous.
     */
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance) => void
    ) => object;
    print?: (line: string) => void;
    printErr?: (line: string) => void;
  }

  export default function createQpdfModule(options?: QpdfInitOptions): Promise<QpdfModule>;
}

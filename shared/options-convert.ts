/**
 * What the renderer may ask about turning OTHER files into PDFs (the convert
 * lane). The conversion itself is invisible to the renderer: `file:open` on a
 * .docx or a .png hands back a DocumentSession like any PDF, unsaved. Types
 * only, re-exported type-only from @shared/types. The extension list is a
 * value and lives in ./convert-inputs.ts.
 */

export interface ConvertEngineStatus {
  /** Stable id, e.g. 'word', 'excel', 'powerpoint', 'builtin-docx', 'image', 'text'. */
  id: string;
  /** Plain-English name, e.g. "Microsoft Word". */
  label: string;
  available: boolean;
  /** What it handles, and why it is or is not available on this computer. */
  note: string;
}

export interface ConvertSupport {
  /** Lowercase extensions WITH the dot this computer can turn into a PDF right now. */
  extensions: string[];
  engines: ConvertEngineStatus[];
}

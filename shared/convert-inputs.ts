/**
 * The file types Legion PDF can OPEN by converting them to PDF first. One list,
 * read by the Open dialog's filters, the OS open-files relay (a .docx handed
 * over by Explorer is opened, not dropped), and the convert lane's registry.
 * A VALUE module: shared/types.ts is type-only.
 */

export const WORD_EXTENSIONS = ['.docx', '.doc', '.rtf'] as const;
export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls'] as const;
export const PRESENTATION_EXTENSIONS = ['.pptx', '.ppt'] as const;
export const TEXT_EXTENSIONS = ['.txt', '.html', '.htm'] as const;
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.bmp',
  '.gif',
  '.webp',
] as const;

export const CONVERTIBLE_EXTENSIONS: readonly string[] = [
  ...WORD_EXTENSIONS,
  ...SPREADSHEET_EXTENSIONS,
  ...PRESENTATION_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
];

/** Everything `file:open` accepts: PDFs, plus everything that can become one. */
export const OPENABLE_EXTENSIONS: readonly string[] = ['.pdf', ...CONVERTIBLE_EXTENSIONS];

/** Lowercase extension with its dot ('.docx'), or '' when the path has none. */
export function extensionOf(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

export function isPdfPath(filePath: string): boolean {
  return extensionOf(filePath) === '.pdf';
}

export function isConvertiblePath(filePath: string): boolean {
  return CONVERTIBLE_EXTENSIONS.includes(extensionOf(filePath));
}

export function isOpenablePath(filePath: string): boolean {
  return OPENABLE_EXTENSIONS.includes(extensionOf(filePath));
}

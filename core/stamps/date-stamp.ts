/**
 * The date beside a signature. Formatting lives here, in pure code, so the
 * signature op itself never reads the clock and stays testable to the byte.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Patterns the panel offers. Order matters: longest token first. */
export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MMMM D, YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DEFAULT_DATE_FORMAT: DateFormat = 'MM/DD/YYYY';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Longest token first, and ONE pass: "March" must not have its M rewritten. */
const TOKENS = /YYYY|MMMM|MM|DD|M|D/g;

function isOffered(format: string): format is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(format);
}

/**
 * Renders a date in one of the offered patterns. An unrecognized pattern falls
 * back to the default rather than being interpreted: free prose around the
 * tokens ("Dated: MM/DD/YYYY") would have its own letters rewritten, and a
 * mangled date beside a signature is worse than a plain one.
 */
export function formatDateStamp(date: Date, format: string = DEFAULT_DATE_FORMAT): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MMMM: MONTH_NAMES[date.getMonth()] ?? '',
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    M: String(date.getMonth() + 1),
    D: String(date.getDate()),
  };
  const pattern = isOffered(format) ? format : DEFAULT_DATE_FORMAT;
  return pattern.replace(TOKENS, (token) => values[token] ?? token);
}

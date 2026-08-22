/**
 * Pure translation between the three shapes a form value wears: pdf.js's
 * per-widget annotationStorage entries (keyed by widget id like "311R"), this
 * lane's per-FIELD edits (keyed by the AcroForm name pdf-lib fills by), and
 * the original values already in the bytes. Everything here is testable with
 * plain objects; nothing touches pdf.js itself.
 */

/** The slice of a pdf.js `getFieldObjects()` entry this lane reads. */
export interface RawFieldObject {
  id: string;
  type?: string;
  value?: unknown;
  exportValues?: unknown;
  editable?: boolean;
}

export type WidgetKind = 'text' | 'checkbox' | 'radio' | 'choice';

/** One fillable widget, with its field name and its as-saved value. */
export interface FormWidget {
  name: string;
  id: string;
  kind: WidgetKind;
  /** The on-state export value; checkbox and radio widgets only. */
  exportValue: string | null;
  /** What the bytes already say, in the edit shape — the "unchanged" baseline. */
  original: string | boolean;
}

const KINDS: Readonly<Record<string, WidgetKind>> = {
  text: 'text',
  checkbox: 'checkbox',
  radiobutton: 'radio',
  combobox: 'choice',
  listbox: 'choice',
};

function widgetOf(name: string, raw: RawFieldObject): FormWidget | null {
  const kind = KINDS[raw.type ?? ''];
  if (kind === undefined || raw.editable === false) return null;
  const exportValue = typeof raw.exportValues === 'string' ? raw.exportValues : null;
  const original =
    kind === 'checkbox' || kind === 'radio'
      ? raw.value === exportValue && exportValue !== null
      : typeof raw.value === 'string'
        ? raw.value
        : '';
  return { name, id: raw.id, kind, exportValue, original };
}

/** Every fillable widget in a `getFieldObjects()` result, in document order. */
export function widgetsOf(fieldObjects: Readonly<Record<string, RawFieldObject[]>>): FormWidget[] {
  return Object.entries(fieldObjects).flatMap(([name, rawList]) =>
    rawList.map((raw) => widgetOf(name, raw)).filter((widget) => widget !== null)
  );
}

/** How many distinct fillable fields the widgets add up to. */
export function fieldNameCount(widgets: readonly FormWidget[]): number {
  return new Set(widgets.map((widget) => widget.name)).size;
}

/**
 * The annotationStorage entries that make pdf.js's inputs show the pending
 * edits — run against a fresh document proxy so typed answers survive the
 * byte swap every edit op causes.
 */
export function storageSeeds(
  widgets: readonly FormWidget[],
  edits: Readonly<Record<string, string | boolean>>
): Array<[string, { value: string | boolean }]> {
  const seeds: Array<[string, { value: string | boolean }]> = [];
  for (const widget of widgets) {
    const edit = edits[widget.name];
    if (edit === undefined) continue;
    if (widget.kind === 'radio') {
      seeds.push([widget.id, { value: edit === widget.exportValue }]);
    } else if (widget.kind === 'checkbox') {
      seeds.push([widget.id, { value: edit === true }]);
    } else {
      seeds.push([widget.id, { value: String(edit) }]);
    }
  }
  return seeds;
}

function foldOne(
  widget: FormWidget,
  value: unknown,
  edits: Record<string, string | boolean>
): void {
  if (widget.kind === 'checkbox') {
    const checked = value === true;
    if (checked !== widget.original) edits[widget.name] = checked;
  } else if (widget.kind === 'radio') {
    // Only the selected widget names the group's value; false entries are
    // pdf.js clearing the siblings.
    if (value === true && widget.original !== true && widget.exportValue !== null) {
      edits[widget.name] = widget.exportValue;
    }
  } else if (typeof value === 'string' && value !== widget.original) {
    edits[widget.name] = value;
  }
}

/**
 * Read every widget's storage entry back into per-field edits, dropping
 * values that match what the bytes already say — so "pending edits" stays an
 * honest count for the badge and the close guard.
 */
export function foldStorage(
  widgets: readonly FormWidget[],
  read: (id: string) => { value?: unknown } | undefined
): Record<string, string | boolean> {
  const edits: Record<string, string | boolean> = {};
  for (const widget of widgets) {
    const entry = read(widget.id);
    if (entry !== undefined && 'value' in entry) foldOne(widget, entry.value, edits);
  }
  return edits;
}

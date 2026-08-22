/**
 * The generic narrowing primitives every Centurion tool validator is built
 * from. Tool-agnostic on purpose: each one checks a single field shape and
 * throws a CenturionToolInputError written FOR THE MODEL — a sentence it can
 * read and correct itself with. The per-tool validators that compose these
 * live in ./centurion-tools next to the tool catalogue.
 */

/** Thrown when a tool call cannot be narrowed. The message goes back to Claude. */
export class CenturionToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CenturionToolInputError';
  }
}

export function fields(input: unknown, tool: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new CenturionToolInputError(`${tool} needs an object of settings.`);
  }
  return input as Record<string, unknown>;
}

export function text(
  source: Record<string, unknown>,
  key: string,
  tool: string,
  max: number
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CenturionToolInputError(`${tool}: "${key}" must be some text.`);
  }
  if (value.length > max) {
    throw new CenturionToolInputError(`${tool}: "${key}" is at most ${max} characters.`);
  }
  return value;
}

/** Like `text`, but an empty string is a real answer (an empty Bates prefix). */
export function optionalText(source: Record<string, unknown>, key: string, tool: string): string {
  const value = source[key];
  if (typeof value !== 'string') {
    throw new CenturionToolInputError(`${tool}: "${key}" must be text.`);
  }
  if (value.length > 32) {
    throw new CenturionToolInputError(`${tool}: "${key}" is at most 32 characters.`);
  }
  return value;
}

export function whole(
  source: Record<string, unknown>,
  key: string,
  tool: string,
  range: { min: number; max: number }
): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new CenturionToolInputError(`${tool}: "${key}" must be a whole number.`);
  }
  if (value < range.min || value > range.max) {
    throw new CenturionToolInputError(
      `${tool}: "${key}" must be between ${range.min} and ${range.max}, not ${value}.`
    );
  }
  return value;
}

export function choice<T extends string>(
  source: Record<string, unknown>,
  key: string,
  tool: string,
  allowed: T[]
): T {
  const value = source[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CenturionToolInputError(
      `${tool}: "${key}" must be one of ${allowed.join(', ')}, not ${JSON.stringify(value)}.`
    );
  }
  return value as T;
}

/** Only sets the key when there is a value — `pages: undefined` is not "no pages". */
export function spread<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

export type UnknownRecord = Readonly<Record<string, unknown>>;

const isArray = Array.isArray;
const isInteger = Number.isInteger;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !isArray(value);
}

export function isInt(value: unknown): value is number {
  return typeof value === 'number' && isInteger(value);
}

export function isIntIn(value: unknown, min: number, max: number): value is number {
  return isInt(value) && value >= min && value <= max;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isStringArray(value: unknown): value is readonly string[] {
  return isArray(value) && value.every((item) => typeof item === 'string');
}

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

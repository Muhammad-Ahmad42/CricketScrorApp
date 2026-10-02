import type { JsonValue } from '@/domain/types';
import { errorIssue, type IssueSink } from './issues';

export type Guard<T> = (value: unknown, path: string, sink: IssueSink) => value is T;

export type FieldGuards<T> = { readonly [K in keyof T]-?: Guard<T[K]> };

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === undefined) {
    return 'nothing';
  }
  if (value === null) {
    return 'an empty value';
  }
  if (typeof value === 'string') {
    return value.length > 40 ? `"${value.slice(0, 37)}..."` : `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return Array.isArray(value) ? 'a list' : 'a group of values';
}

export function reject(sink: IssueSink, path: string, expected: string, value: unknown): false {
  sink.add(errorIssue('INVALID_VALUE', `Expected ${expected}, found ${describe(value)}.`, path));
  return false;
}

export const text: Guard<string> = (value, path, sink): value is string =>
  typeof value === 'string' || reject(sink, path, 'text', value);

export const nonEmptyText: Guard<string> = (value, path, sink): value is string =>
  (typeof value === 'string' && value.trim().length > 0) || reject(sink, path, 'some text', value);

export const idText: Guard<string> = (value, path, sink): value is string =>
  (typeof value === 'string' && value.length > 0) || reject(sink, path, 'an id', value);

export function textOfLength(min: number, max: number): Guard<string> {
  return (value, path, sink): value is string =>
    (typeof value === 'string' && value.length >= min && value.length <= max) ||
    reject(sink, path, `text of ${min} to ${max} characters`, value);
}

export const bool: Guard<boolean> = (value, path, sink): value is boolean =>
  typeof value === 'boolean' || reject(sink, path, 'true or false', value);

function rangeText(min: number, max: number): string {
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return ` from ${min} to ${max}`;
  }
  if (Number.isFinite(min)) {
    return ` of at least ${min}`;
  }
  return Number.isFinite(max) ? ` of at most ${max}` : '';
}

export function integer(min: number = -Infinity, max: number = Infinity): Guard<number> {
  return (value, path, sink): value is number =>
    (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) ||
    reject(sink, path, `a whole number${rangeText(min, max)}`, value);
}

export function finiteNumber(min: number = -Infinity): Guard<number> {
  return (value, path, sink): value is number =>
    (typeof value === 'number' && Number.isFinite(value) && value >= min) || reject(sink, path, `a number${rangeText(min, Infinity)}`, value);
}

export function literal<T extends string | number | boolean>(...values: readonly T[]): Guard<T> {
  const allowed = new Set<unknown>(values);
  const expected = values.length <= 6 ? `one of ${values.map((entry) => JSON.stringify(entry)).join(', ')}` : 'a known value';
  return (value, path, sink): value is T => allowed.has(value) || reject(sink, path, expected, value);
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d(\.\d{1,9})?)?(Z|[+-]([01]\d|2[0-3]):?[0-5]\d)$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

function matchesDate(pattern: RegExp, value: string): boolean {
  const found = pattern.exec(value);
  return found !== null && validCalendarDate(Number(found[1]), Number(found[2]), Number(found[3]));
}

export const isoDate: Guard<string> = (value, path, sink): value is string =>
  (typeof value === 'string' && matchesDate(DATE_PATTERN, value)) || reject(sink, path, 'a date like 2026-09-30', value);

export const isoDateTime: Guard<string> = (value, path, sink): value is string =>
  (typeof value === 'string' && matchesDate(DATE_TIME_PATTERN, value)) ||
  reject(sink, path, 'a date and time like 2026-09-30T14:05:00.000Z', value);

export const localTime: Guard<string> = (value, path, sink): value is string =>
  (typeof value === 'string' && TIME_PATTERN.test(value)) || reject(sink, path, 'a time like 14:05', value);

export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value, path, sink): value is T | null => value === null || guard(value, path, sink);
}

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value, path, sink): value is T | undefined => value === undefined || guard(value, path, sink);
}

export function arrayOf<T>(guard: Guard<T>): Guard<readonly T[]> {
  return (value, path, sink): value is readonly T[] => {
    if (!Array.isArray(value)) {
      return reject(sink, path, 'a list', value);
    }
    let ok = true;
    value.forEach((entry, index) => {
      if (!guard(entry, `${path}[${index}]`, sink)) {
        ok = false;
      }
    });
    return ok;
  };
}

export function object<T>(fields: FieldGuards<T>): Guard<T> {
  const names = Object.keys(fields) as (keyof T & string)[];
  return (value, path, sink): value is T => {
    if (!isRecord(value)) {
      return reject(sink, path, 'a group of values', value);
    }
    let ok = true;
    for (const name of names) {
      const guard: Guard<T[keyof T & string]> = fields[name];
      if (!guard(value[name], `${path}.${name}`, sink)) {
        ok = false;
      }
    }
    return ok;
  };
}

export function discriminated<T extends Readonly<Record<D, string>>, D extends string>(
  tag: D,
  cases: { readonly [K in T[D]]: Guard<Extract<T, Readonly<Record<D, K>>>> },
): Guard<T> {
  const table: Readonly<Record<string, Guard<T> | undefined>> = cases;
  const expected = `one of ${Object.keys(cases).map((entry) => JSON.stringify(entry)).join(', ')}`;
  return (value, path, sink): value is T => {
    if (!isRecord(value)) {
      return reject(sink, path, 'a group of values', value);
    }
    const tagValue = value[tag];
    const guard = typeof tagValue === 'string' ? table[tagValue] : undefined;
    if (guard === undefined) {
      return reject(sink, `${path}.${tag}`, Object.keys(cases).length <= 8 ? expected : 'a known kind', tagValue);
    }
    return guard(value, path, sink);
  };
}

function isJson(value: unknown, depth: number): boolean {
  if (depth > 64) {
    return false;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJson(entry, depth + 1));
  }
  return isRecord(value) && Object.values(value).every((entry) => isJson(entry, depth + 1));
}

export const jsonValue: Guard<JsonValue> = (value, path, sink): value is JsonValue =>
  isJson(value, 0) || reject(sink, path, 'plain data', value);

export function jsonObject<T>(): Guard<T> {
  return (value, path, sink): value is T => (isRecord(value) && isJson(value, 0)) || reject(sink, path, 'a group of values', value);
}

export function refine<T>(guard: Guard<T>, check: (value: T) => string | null): Guard<T> {
  return (value, path, sink): value is T => {
    if (!guard(value, path, sink)) {
      return false;
    }
    const problem = check(value);
    if (problem === null) {
      return true;
    }
    sink.add(errorIssue('INVALID_VALUE', problem, path));
    return false;
  };
}

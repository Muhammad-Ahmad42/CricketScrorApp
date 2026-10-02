import type { JsonValue } from '@/domain/types';

function isPlainObject(value: object): value is Readonly<Record<string, unknown>> {
  return !Array.isArray(value);
}

export function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === 'object' && isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        out[key] = toJsonValue(entry);
      }
    }
    return out;
  }
  return null;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => deepEqual(entry, b[index]));
  }
  const left = Object.entries(a).filter(([, entry]) => entry !== undefined);
  const right = new Map(Object.entries(b).filter(([, entry]) => entry !== undefined));
  return left.length === right.size && left.every(([key, entry]) => right.has(key) && deepEqual(entry, right.get(key)));
}

export function trimmedOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^\d{2}:\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= days;
}

export function isLocalTime(value: string): boolean {
  if (!LOCAL_TIME.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60;
}

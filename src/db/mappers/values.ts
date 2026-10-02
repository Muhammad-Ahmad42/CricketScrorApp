import { InvalidRowsError } from '../errors';
import type { SqlValue } from '../types';

export type SqlRecord = Readonly<Record<string, SqlValue>>;

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function toJsonOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

export function parseJson<T>(text: string): T {
  const value: unknown = JSON.parse(text);
  return value as T;
}

export function parseJsonOrNull<T>(text: string | null): T | null {
  return text === null ? null : parseJson<T>(text);
}

export function toFlag(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function fromFlag(value: number): boolean {
  return value === 1;
}

export function required<T>(value: T | null | undefined, column: string): T {
  if (value === null || value === undefined) {
    throw new InvalidRowsError(`Column ${column} is unexpectedly empty.`);
  }
  return value;
}

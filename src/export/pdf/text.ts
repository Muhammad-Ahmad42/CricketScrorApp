export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function joinPresent(parts: readonly (string | null | undefined)[], separator: string): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(separator);
}

export type NameLookup = (id: string | null) => string;

export function nameLookup(entries: Iterable<readonly [string, string]>, fallback: string): NameLookup {
  const names = new Map(entries);
  return (id) => (id === null ? fallback : names.get(id) ?? fallback);
}

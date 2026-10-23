export function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
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

export function plural(count: number | string, singular: string, pluralForm: string = `${singular}s`): string {
  const one = typeof count === 'number' ? count === 1 : count.trim() === '1';
  return `${count} ${one ? singular : pluralForm}`;
}

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

export const MIN_REASON_CHARACTERS = 3;

export function reasonReady(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.replace(/\s/g, '').length >= MIN_REASON_CHARACTERS;
}

export function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

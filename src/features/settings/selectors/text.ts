const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatDay(iso: string): string {
  const date = parse(iso);
  if (!date) {
    return iso;
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDayTime(iso: string): string {
  const date = parse(iso);
  if (!date) {
    return iso;
  }
  return `${formatDay(iso)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatCount(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.trunc(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface Noun {
  readonly one: string;
  readonly many: string;
}

export function countOf(value: number, noun: Noun): string {
  return `${formatCount(value)} ${value === 1 ? noun.one : noun.many}`;
}

export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts.join('');
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function fileNameOf(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? uri;
  const segments = withoutQuery.split('/').filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? withoutQuery;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.length > 0 ? spaced : key;
}

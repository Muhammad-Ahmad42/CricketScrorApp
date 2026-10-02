const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parts(isoDate: string): { readonly year: number; readonly month: number; readonly day: number } | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function isValidIsoDate(value: string): boolean {
  return parts(value) !== null;
}

export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME.test(value);
}

export function formatDate(isoDate: string | null): string | null {
  if (isoDate === null) {
    return null;
  }
  const p = parts(isoDate);
  if (p === null) {
    return isoDate;
  }
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

export function formatDateTime(isoDate: string | null, time: string | null): string | null {
  const date = formatDate(isoDate);
  if (date === null) {
    return time;
  }
  return time ? `${date} ${time}` : date;
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) {
    return `${from} – ${to}`;
  }
  return from ?? to;
}

export function compareDates(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a < b ? -1 : 1;
}

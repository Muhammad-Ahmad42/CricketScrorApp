const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(iso: string): { readonly year: number; readonly month: number; readonly day: number; readonly weekday: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime()) || month < 0 || month > 11) {
    return null;
  }
  return { year, month, day, weekday: date.getUTCDay() };
}

export function formatDateLabel(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const value = parts(iso);
  if (value === null) {
    return null;
  }
  return `${DAYS[value.weekday]} ${value.day} ${MONTHS[value.month]} ${value.year}`;
}

export function formatShortDate(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const value = parts(iso);
  return value === null ? null : `${DAYS[value.weekday]} ${value.day} ${MONTHS[value.month]}`;
}

export function monthHeading(iso: string | null): string {
  if (iso === null) {
    return 'No date';
  }
  const value = parts(iso);
  return value === null ? 'No date' : `${LONG_MONTHS[value.month]} ${value.year}`;
}

export function formatTimeOfDay(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  return match === null ? null : `${match[1]}:${match[2]}`;
}


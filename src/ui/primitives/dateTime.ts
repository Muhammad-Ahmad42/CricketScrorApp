export type IsoDate = string;
export type LocalTime = string;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function parseIsoDate(value: string | null | undefined): CalendarDay | null {
  if (value === null || value === undefined) {
    return null;
  }
  const match = ISO_DATE.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const probe = new Date(year, month, day, 12);
  if (probe.getFullYear() !== year || probe.getMonth() !== month || probe.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function isoDateToLocal(value: string | null | undefined): Date | null {
  const day = parseIsoDate(value);
  return day === null ? null : new Date(day.year, day.month, day.day, 12);
}

export function localToIsoDate(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDayLabel(value: string | null | undefined, now: Date = new Date()): string | null {
  const day = parseIsoDate(value);
  if (day === null) {
    return null;
  }
  const weekday = new Date(day.year, day.month, day.day, 12).getDay();
  const base = `${WEEKDAYS[weekday]} ${day.day} ${MONTHS[day.month]}`;
  return day.year === now.getFullYear() ? base : `${base} ${day.year}`;
}

export function spokenDayLabel(value: string | null | undefined): string | null {
  const day = parseIsoDate(value);
  if (day === null) {
    return null;
  }
  const weekday = new Date(day.year, day.month, day.day, 12).getDay();
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
  return `${names[weekday]} ${day.day} ${MONTH_NAMES[day.month]} ${day.year}`;
}

export interface ClockTime {
  readonly hours: number;
  readonly minutes: number;
}

export function parseLocalTime(value: string | null | undefined): ClockTime | null {
  if (value === null || value === undefined) {
    return null;
  }
  const match = LOCAL_TIME.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

export function localToTime(date: Date): LocalTime {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timeToLocal(value: string | null | undefined, base: Date = new Date()): Date | null {
  const time = parseLocalTime(value);
  if (time === null) {
    return null;
  }
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.hours, time.minutes, 0, 0);
}

export function formatTimeLabel(value: string | null | undefined): string | null {
  const time = parseLocalTime(value);
  return time === null ? null : `${pad(time.hours)}:${pad(time.minutes)}`;
}

export function clampDate(date: Date, minimum: Date | null, maximum: Date | null): Date {
  if (minimum !== null && date.getTime() < minimum.getTime()) {
    return minimum;
  }
  if (maximum !== null && date.getTime() > maximum.getTime()) {
    return maximum;
  }
  return date;
}

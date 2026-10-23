import { matchDisplayDate, type MatchDateSource } from '@/domain/scoring/matchDates';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: number;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function instant(iso: string): Date | null {
  if (!DATE_TIME.test(iso)) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parts(iso: string): DateParts | null {
  const moment = instant(iso);
  if (moment !== null) {
    return { year: moment.getFullYear(), month: moment.getMonth(), day: moment.getDate(), weekday: moment.getDay() };
  }
  const match = DATE_ONLY.exec(iso) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
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

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function formatTimeOfDay(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const moment = instant(iso);
  if (moment !== null) {
    return `${twoDigits(moment.getHours())}:${twoDigits(moment.getMinutes())}`;
  }
  const match = /^(\d{2}):(\d{2})/.exec(iso);
  return match === null ? null : `${match[1]}:${match[2]}`;
}

export function localDateOf(moment: Date): string {
  return `${moment.getFullYear()}-${twoDigits(moment.getMonth() + 1)}-${twoDigits(moment.getDate())}`;
}

export function localTimeOf(moment: Date): string {
  return `${twoDigits(moment.getHours())}:${twoDigits(moment.getMinutes())}`;
}

export function matchDateIso(source: MatchDateSource): string {
  return matchDisplayDate(source).value;
}

export function matchShortDate(source: MatchDateSource): string | null {
  return formatShortDate(matchDateIso(source));
}

export function matchLongDate(source: MatchDateSource): string | null {
  return formatDateLabel(matchDateIso(source));
}

export function matchMonthHeading(source: MatchDateSource): string {
  return monthHeading(matchDateIso(source));
}

export function shiftTime(time: string, minutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) {
    return time;
  }
  const day = 24 * 60;
  const total = (((Number(match[1]) * 60 + Number(match[2]) + minutes) % day) + day) % day;
  return `${twoDigits(Math.floor(total / 60))}:${twoDigits(total % 60)}`;
}

export function roundedTime(moment: Date, step: number): string {
  const minutes = Math.round((moment.getHours() * 60 + moment.getMinutes()) / step) * step;
  return shiftTime('00:00', minutes);
}

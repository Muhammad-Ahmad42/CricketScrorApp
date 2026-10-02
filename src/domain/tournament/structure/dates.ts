import type { IsoDate } from '../../types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parts(date: IsoDate): { readonly year: number; readonly month: number; readonly day: number } {
  const match = ISO_DATE.exec(date);
  if (!match) {
    throw new Error(`Invalid date "${date}": expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid date "${date}".`);
  }
  return { year, month, day };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function isIsoDate(value: string): boolean {
  try {
    parts(value);
    return true;
  } catch {
    return false;
  }
}

export function nextIsoDate(date: IsoDate): IsoDate {
  const { year, month, day } = parts(date);
  if (day < daysInMonth(year, month)) {
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day + 1, 2)}`;
  }
  if (month < 12) {
    return `${pad(year, 4)}-${pad(month + 1, 2)}-01`;
  }
  return `${pad(year + 1, 4)}-01-01`;
}

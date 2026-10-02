const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;
const TIME_PART = /T(\d{2}):(\d{2})/;

export function formatPrintDate(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const found = DATE_PREFIX.exec(value);
  if (found === null) {
    return value;
  }
  const month = MONTHS[Number(found[2]) - 1];
  return month === undefined ? value : `${Number(found[3])} ${month} ${found[1]}`;
}

export function formatPrintDateTime(value: string): string {
  const date = formatPrintDate(value);
  const time = TIME_PART.exec(value);
  if (date === null || date === value) {
    return value;
  }
  return time === null ? date : `${date}, ${time[1]}:${time[2]}`;
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  const from = formatPrintDate(start);
  const to = formatPrintDate(end);
  if (from !== null && to !== null) {
    return from === to ? from : `${from} – ${to}`;
  }
  return from ?? to;
}

/** @jest-environment node */
import { countOf, fileNameOf, formatCount, formatDay, formatDayTime, humanizeKey, joinList } from '../selectors/text';

describe('text helpers', () => {
  it('formats a calendar day without depending on the device locale', () => {
    expect(formatDay('2026-09-30T12:00:00.000Z')).toBe('30 Sep 2026');
    expect(formatDay('2026-01-05T12:00:00.000Z')).toBe('5 Jan 2026');
  });

  it('formats a day with a two-digit local time', () => {
    const iso = '2026-09-30T12:15:00.000Z';
    const local = new Date(iso);
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    expect(formatDayTime(iso)).toBe(`${formatDay(iso)}, ${hh}:${mm}`);
    expect(formatDayTime(iso)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
  });

  it('returns an unreadable timestamp unchanged instead of "Invalid Date"', () => {
    expect(formatDay('not-a-date')).toBe('not-a-date');
    expect(formatDayTime('')).toBe('');
  });

  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(4210)).toBe('4,210');
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(-1500)).toBe('-1,500');
  });

  it('pluralises counts', () => {
    const noun = { one: 'match', many: 'matches' };
    expect(countOf(1, noun)).toBe('1 match');
    expect(countOf(0, noun)).toBe('0 matches');
    expect(countOf(2400, noun)).toBe('2,400 matches');
  });

  it('joins lists in plain English', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['3 matches'])).toBe('3 matches');
    expect(joinList(['3 matches', '240 scoring events'])).toBe('3 matches and 240 scoring events');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('extracts a readable file name from a file URI', () => {
    expect(fileNameOf('file:///data/cache/exports/scorebook-backup-2026-09-30.json')).toBe('scorebook-backup-2026-09-30.json');
    expect(fileNameOf('content://downloads/City%20Cup.json?x=1')).toBe('City Cup.json');
    expect(fileNameOf('backup.json')).toBe('backup.json');
    expect(fileNameOf('file:///bad%E0name.json')).toBe('bad%E0name.json');
  });

  it('turns unknown keys into words', () => {
    expect(humanizeKey('matchEvents')).toBe('match events');
    expect(humanizeKey('pool_entries')).toBe('pool entries');
    expect(humanizeKey('team')).toBe('team');
  });
});

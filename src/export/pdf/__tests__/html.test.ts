/** @jest-environment node */
import { formatDateRange, formatPrintDate, formatPrintDateTime } from '../dates';
import { cssString, escapeHtml, html, join, trusted, when } from '../html';
import { joinPresent, nameLookup, ordinal, pluralize } from '../text';

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  });

  it('leaves other text, emoji and Urdu unchanged', () => {
    expect(escapeHtml('Ali \u{1F3CF} بابر')).toBe('Ali \u{1F3CF} بابر');
  });
});

describe('cssString', () => {
  it('quotes text so it cannot close the string or the style element', () => {
    expect(cssString('a"b\\c</style>')).toBe('"a\\22 b\\5c c\\3c /style\\3e "');
    expect(cssString("it's\nnew & old")).toBe('"it\\27 s\\a new \\26  old"');
  });
});

describe('html template', () => {
  it('escapes interpolated text and keeps trusted markup', () => {
    const name = '<b>Babar</b>';
    expect(html`<td>${name}</td>`.html).toBe('<td>&lt;b&gt;Babar&lt;/b&gt;</td>');
    expect(html`<td>${trusted('<b>x</b>')}</td>`.html).toBe('<td><b>x</b></td>');
    expect(html`<p>${html`<i>${'&'}</i>`}</p>`.html).toBe('<p><i>&amp;</i></p>');
  });

  it('renders numbers, lists and empty values', () => {
    expect(html`${1}|${Number.NaN}|${null}|${undefined}|${false}|${['a', 'b']}`.html).toBe('1|||||ab');
    expect(join(['a', null, '<'], ', ').html).toBe('a, &lt;');
    expect(html`${when(false, () => 'x')}${when(true, () => 'y')}`.html).toBe('y');
  });
});

describe('print dates', () => {
  it('formats dates and times from their literal ISO parts', () => {
    expect(formatPrintDate('2026-09-30')).toBe('30 Sep 2026');
    expect(formatPrintDate('2026-01-05T23:59:00.000Z')).toBe('5 Jan 2026');
    expect(formatPrintDate(null)).toBeNull();
    expect(formatPrintDate('soon')).toBe('soon');
    expect(formatPrintDate('2026-13-01')).toBe('2026-13-01');
    expect(formatPrintDateTime('2026-09-30T14:05:00+05:00')).toBe('30 Sep 2026, 14:05');
    expect(formatPrintDateTime('2026-09-30')).toBe('30 Sep 2026');
    expect(formatPrintDateTime('today at noon')).toBe('today at noon');
  });

  it('formats date ranges', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('1 Sep 2026 – 30 Sep 2026');
    expect(formatDateRange('2026-09-01', '2026-09-01')).toBe('1 Sep 2026');
    expect(formatDateRange(null, '2026-09-30')).toBe('30 Sep 2026');
    expect(formatDateRange(null, null)).toBeNull();
  });
});

describe('text helpers', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '111th',
    ]);
  });

  it('pluralises, joins and looks up names', () => {
    expect(pluralize(1, 'over', 'overs')).toBe('1 over');
    expect(pluralize(2, 'over', 'overs')).toBe('2 overs');
    expect(joinPresent(['a', null, ' ', undefined, 'b'], ', ')).toBe('a, b');
    const lookup = nameLookup([['p1', 'Babar']], 'Unknown');
    expect(lookup('p1')).toBe('Babar');
    expect(lookup('p2')).toBe('Unknown');
    expect(lookup(null)).toBe('Unknown');
  });
});

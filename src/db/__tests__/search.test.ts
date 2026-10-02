/** @jest-environment node */
import { foldForSearch, pageOf, textMatcher } from '../repositories/search';

describe('search text folding', () => {
  it('folds case for accented Latin, Greek, Cyrillic and German text', () => {
    expect(foldForSearch('Élan XI')).toBe(foldForSearch('élan xi'));
    expect(foldForSearch('ÇAĞRI')).toBe(foldForSearch('çağrı'));
    expect(foldForSearch('ΣΠΑΡΤΗ')).toBe(foldForSearch('σπαρτη'));
    expect(foldForSearch('ΟΔΟΣ')).toBe(foldForSearch('οδος'));
    expect(foldForSearch('ОДЕССА')).toBe(foldForSearch('одесса'));
    expect(foldForSearch('STRASSE')).toBe(foldForSearch('straße'));
  });

  it('treats composed and decomposed accents and full-width letters as the same text', () => {
    expect(foldForSearch('E\u0301lan')).toBe(foldForSearch('\u00c9lan'));
    expect(foldForSearch('\uff2c\uff49\uff4f\uff4e\uff53')).toBe('lions');
  });

  it('leaves scripts without case untouched', () => {
    expect(foldForSearch('لاہور قلندرز')).toBe('لاہور قلندرز'.normalize('NFKC'));
    expect(foldForSearch('चेन्नई')).toBe('चेन्नई'.normalize('NFKC'));
  });
});

describe('textMatcher', () => {
  it('returns null for a missing or blank search so no filter applies', () => {
    expect(textMatcher(undefined)).toBeNull();
    expect(textMatcher('')).toBeNull();
    expect(textMatcher('   \t ')).toBeNull();
  });

  it('matches a trimmed, case-folded substring of any given text and skips nulls', () => {
    const matcher = textMatcher('  élan ');
    expect(matcher).not.toBeNull();
    expect(matcher?.(['Lions v Élan XI', null])).toBe(true);
    expect(matcher?.([null, 'ÉLAN'])).toBe(true);
    expect(matcher?.(['Elan', null])).toBe(false);
    expect(matcher?.([])).toBe(false);
  });

  it('matches wildcards, quotes and backslashes literally', () => {
    expect(textMatcher('%')?.(['100% effort'])).toBe(true);
    expect(textMatcher('%')?.(['plain'])).toBe(false);
    expect(textMatcher('_')?.(['A_B'])).toBe(true);
    expect(textMatcher('_')?.(['AB'])).toBe(false);
    expect(textMatcher("o'brien")?.(["O'Brien XI"])).toBe(true);
    expect(textMatcher('\\%')?.(['c:\\cup\\'])).toBe(false);
    expect(textMatcher('c:\\cup')?.(['C:\\CUP\\'])).toBe(true);
  });
});

describe('pageOf', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('applies offset and limit like SQL LIMIT/OFFSET', () => {
    expect(pageOf(items, undefined, undefined)).toEqual(items);
    expect(pageOf(items, 2, undefined)).toEqual(['a', 'b']);
    expect(pageOf(items, 2, 3)).toEqual(['d', 'e']);
    expect(pageOf(items, 2, 4)).toEqual(['e']);
    expect(pageOf(items, 2, 9)).toEqual([]);
    expect(pageOf(items, 0, 0)).toEqual([]);
  });

  it('treats a negative limit as no limit and a negative offset as zero', () => {
    expect(pageOf(items, -1, 1)).toEqual(['b', 'c', 'd', 'e']);
    expect(pageOf(items, 2, -3)).toEqual(['a', 'b']);
  });
});

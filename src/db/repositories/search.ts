const FINAL_SIGMA = /ς/g;
const SIGMA = 'σ';

export function foldForSearch(text: string): string {
  return text.normalize('NFKC').toUpperCase().toLowerCase().replace(FINAL_SIGMA, SIGMA);
}

export type TextMatcher = (texts: readonly (string | null)[]) => boolean;

export function textMatcher(search: string | undefined): TextMatcher | null {
  if (search === undefined) {
    return null;
  }
  const needle = foldForSearch(search.trim());
  if (needle === '') {
    return null;
  }
  return (texts) => texts.some((text) => text !== null && foldForSearch(text).includes(needle));
}

export function pageOf<T>(items: readonly T[], limit: number | undefined, offset: number | undefined): T[] {
  const start = Math.max(0, offset ?? 0);
  if (limit === undefined || limit < 0) {
    return items.slice(start);
  }
  return items.slice(start, start + limit);
}

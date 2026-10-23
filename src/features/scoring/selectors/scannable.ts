export interface Scannable {
  readonly headline: string;
  readonly detail: string | null;
}

function text(source: object, key: string): string | null {
  const value = (source as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function scannable(source: object, fallbackKey: 'message' | 'text' | 'reason' = 'message'): Scannable {
  const full = text(source, fallbackKey) ?? '';
  const headline = text(source, 'headline');
  const detail = text(source, 'detail');
  if (headline === null) {
    return { headline: full, detail };
  }
  return { headline, detail: detail ?? (full !== '' && full !== headline ? full : null) };
}

export function errorHeadline(error: { readonly message: string } | null | undefined, fallback: string): string {
  if (error === null || error === undefined) {
    return fallback;
  }
  return text(error, 'headline') ?? text(error, 'message') ?? fallback;
}

import type { Explained } from '../types';

export const HEADLINE_LIMIT = 40;
export const SUPPORTING_LIMIT = 80;

const SENTENCE_BREAK = /[.!?]["”’)]?\s+(?=[A-Z0-9“"‘'(])/;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function stripPeriod(text: string): string {
  const trimmed = clean(text);
  return trimmed.endsWith('.') && !trimmed.endsWith('..') ? trimmed.slice(0, -1) : trimmed;
}

export function asSentence(text: string): string {
  const trimmed = clean(text);
  if (trimmed.length === 0) return trimmed;
  return /[.!?]["”’)]?$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function explain(headline: string, detail?: string | null): Explained {
  const head = stripPeriod(headline);
  const body = detail === undefined || detail === null ? '' : clean(detail);
  return body.length > 0 ? { headline: head, detail: asSentence(body) } : { headline: head };
}

export function splitExplained(text: string): Explained {
  const trimmed = clean(text);
  const match = SENTENCE_BREAK.exec(trimmed);
  if (match === null) return explain(trimmed);
  const cut = match.index + match[0].trimEnd().length;
  return explain(trimmed.slice(0, cut), trimmed.slice(cut));
}

export function explainedText(value: Explained): string {
  const head = asSentence(value.headline);
  return value.detail ? `${head} ${value.detail}` : head;
}

export function isScannableHeadline(text: string, limit: number = HEADLINE_LIMIT): boolean {
  return clean(text).length <= limit;
}

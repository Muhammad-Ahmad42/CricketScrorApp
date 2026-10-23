import { splitExplained } from '@/domain/text';
import type { ServiceError } from '@/services/contracts';

export interface ProblemVM {
  readonly headline: string;
  readonly supporting: string | null;
}

export function problemText(text: string): ProblemVM {
  const parts = splitExplained(text);
  return { headline: parts.headline, supporting: parts.detail ?? null };
}

export function problemOf(error: ServiceError | null | undefined, fallback: string): ProblemVM {
  if (!error) {
    return problemText(fallback);
  }
  if (error.headline !== undefined && error.headline.trim().length > 0) {
    return { headline: error.headline, supporting: error.supporting ?? null };
  }
  return problemText(error.message);
}

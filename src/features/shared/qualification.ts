import type { QualificationState } from '@/domain/types';
import type { BadgeTone } from '@/ui';
import { MANUAL_OVERRIDE_LABEL } from './ManualOverrideBadge';

export type QualificationCertainty = 'mathematical' | 'provisional' | 'manual';

export const QUALIFICATION_STATE_LABEL: { readonly [K in QualificationState]: string } = {
  qualified: 'Qualified',
  in_contention: 'In contention',
  eliminated: 'Eliminated',
};

export const QUALIFICATION_SHORT: { readonly [K in QualificationState]: string } = {
  qualified: 'Q',
  in_contention: '–',
  eliminated: 'E',
};

export const CERTAINTY_LABEL: { readonly [K in QualificationCertainty]: string } = {
  mathematical: 'Mathematical',
  provisional: 'Provisional',
  manual: 'Manual',
};

const STATE_TONE: { readonly [K in QualificationState]: BadgeTone } = {
  qualified: 'qualified',
  in_contention: 'contention',
  eliminated: 'eliminated',
};

export function qualificationBadge(state: QualificationState, manual: boolean): { readonly label: string; readonly tone: BadgeTone } {
  if (manual) {
    return { label: MANUAL_OVERRIDE_LABEL, tone: 'override' };
  }
  return { label: QUALIFICATION_STATE_LABEL[state], tone: STATE_TONE[state] };
}

export function qualificationSummary(state: QualificationState, certainty: QualificationCertainty, manual: boolean): string {
  const stateText = QUALIFICATION_STATE_LABEL[state];
  if (manual) {
    return `${stateText} · ${MANUAL_OVERRIDE_LABEL}`;
  }
  if (state === 'in_contention') {
    return stateText;
  }
  return `${stateText} · ${CERTAINTY_LABEL[certainty]}`;
}

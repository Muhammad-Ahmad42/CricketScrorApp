import type { TournamentWizardStep } from '@/stores';

export interface WizardStepInfo {
  readonly step: TournamentWizardStep;
  readonly title: string;
}

export const WIZARD_STEPS: readonly WizardStepInfo[] = [
  { step: 'info', title: 'New tournament' },
  { step: 'teams', title: 'Teams' },
  { step: 'structure', title: 'Format' },
  { step: 'rules', title: 'Rules' },
  { step: 'pools', title: 'Pools' },
  { step: 'fixtures', title: 'Fixtures' },
  { step: 'review', title: 'Review' },
];

export function stepNumber(step: TournamentWizardStep): number {
  return WIZARD_STEPS.findIndex((candidate) => candidate.step === step) + 1;
}

export function stepTitle(step: TournamentWizardStep): string {
  return WIZARD_STEPS.find((candidate) => candidate.step === step)?.title ?? 'New tournament';
}

export function nextStep(step: TournamentWizardStep): TournamentWizardStep | null {
  const position = stepNumber(step);
  return WIZARD_STEPS[position]?.step ?? null;
}

export function previousStep(step: TournamentWizardStep): TournamentWizardStep | null {
  const position = stepNumber(step) - 2;
  return position >= 0 ? WIZARD_STEPS[position].step : null;
}

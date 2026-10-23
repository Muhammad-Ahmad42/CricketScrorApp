import type { AppServices } from '@/services/contracts';
import { SILENT_FEEDBACK, type ScoringFeedback } from '@/services';

let current: AppServices | null = null;
let feedback: ScoringFeedback = SILENT_FEEDBACK;

export function setAppServices(services: AppServices): void {
  current = services;
}

export function getAppServices(): AppServices {
  if (!current) {
    throw new Error('App services have not been initialised');
  }
  return current;
}

export function hasAppServices(): boolean {
  return current !== null;
}

export function clearAppServices(): void {
  current = null;
  feedback = SILENT_FEEDBACK;
}

export function setScoringFeedback(next: ScoringFeedback): void {
  feedback = next;
}

export function getScoringFeedback(): ScoringFeedback {
  return feedback;
}

export function tabChangeFeedback(): void {
  feedback.cue('tab');
}

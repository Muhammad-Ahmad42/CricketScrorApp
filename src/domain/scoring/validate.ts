import type {
  BowlerIneligibility,
  DeliveryCall,
  DeliveryDismissalType,
  MatchEvent,
  MatchEventInput,
  MatchSetup,
  MatchState,
  PlayerId,
  ReplayIssue,
  ValidationMode,
  ValidationResult,
} from '../types';
import { bowlerEligibilityOf, incomingBatters, inProgressInnings } from './internal/eligibility';
import { dismissalsFor } from './internal/validation/delivery';
import { validateEventCore } from './internal/validation';
import { replayMatch } from './replay';

export function validateEvent(setup: MatchSetup, state: MatchState, event: MatchEventInput, mode: ValidationMode = 'append'): ValidationResult {
  return validateEventCore(setup, state, event, mode);
}

export function validateLog(
  setup: MatchSetup,
  events: readonly MatchEvent[],
): { readonly ok: true; readonly state: MatchState } | { readonly ok: false; readonly issues: readonly ReplayIssue[]; readonly state: MatchState } {
  const state = replayMatch(setup, events);
  if (state.needsRepair) {
    return { ok: false, issues: state.issues, state };
  }
  return { ok: true, state };
}

export function allowedDismissals(call: DeliveryCall, isFreeHit: boolean): readonly DeliveryDismissalType[] {
  return dismissalsFor(call, isFreeHit);
}

export function bowlerEligibility(
  setup: MatchSetup,
  state: MatchState,
): { readonly eligible: readonly PlayerId[]; readonly ineligible: readonly { readonly playerId: PlayerId; readonly reason: BowlerIneligibility }[] } {
  const innings = inProgressInnings(state);
  if (innings === null) {
    return { eligible: [], ineligible: [] };
  }
  return bowlerEligibilityOf(setup, state, innings);
}

export function eligibleIncomingBatters(setup: MatchSetup, state: MatchState): readonly PlayerId[] {
  const innings = inProgressInnings(state);
  if (innings === null) {
    return [];
  }
  return incomingBatters(setup, state, innings);
}

import type { MatchEventInput, MatchSetup, MatchState, ValidationMode, ValidationResult } from '../../../types';
import { hasValidShape } from '../shape';
import { validateBowlerSelected } from './bowling';
import { fail, lifecycleGate, pass, UNREADABLE_MESSAGE } from './common';
import { validateBatterDismissed, validateBatterIn, validateBatterRetired, validateInningsEnded, validateStrikeSwapped } from './crease';
import { validateDelivery } from './delivery';
import { validateInningsStarted, validateSuperOverStarted } from './innings';
import { validateMatchEnded, validateOversRevised, validatePenalty, validatePlayResumed } from './organizer';

function validateKind(setup: MatchSetup, state: MatchState, event: MatchEventInput, mode: ValidationMode): ValidationResult {
  switch (event.kind) {
    case 'innings_started':
      return validateInningsStarted(setup, state, event);
    case 'delivery':
      return validateDelivery(setup, state, event, mode);
    case 'batter_in':
      return validateBatterIn(setup, state, event);
    case 'bowler_selected':
      return validateBowlerSelected(setup, state, event);
    case 'strike_swapped':
      return validateStrikeSwapped(setup, state);
    case 'batter_retired':
      return validateBatterRetired(setup, state, event);
    case 'batter_dismissed':
      return validateBatterDismissed(setup, state, event);
    case 'penalty_awarded':
      return validatePenalty(setup, state, event);
    case 'overs_revised':
      return validateOversRevised(setup, state, event);
    case 'play_suspended':
      return pass();
    case 'play_resumed':
      return validatePlayResumed(state);
    case 'innings_ended':
      return validateInningsEnded(setup, state, event);
    case 'super_over_started':
      return validateSuperOverStarted(setup, state, event);
    case 'match_ended':
      return validateMatchEnded(setup, state, event);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

export function validateEventCore(setup: MatchSetup, state: MatchState, event: MatchEventInput, mode: ValidationMode): ValidationResult {
  if (!hasValidShape(event)) {
    return fail('UNKNOWN_EVENT_KIND', UNREADABLE_MESSAGE);
  }
  const gate = lifecycleGate(state, event);
  if (gate !== null) {
    return gate;
  }
  return validateKind(setup, state, event, mode);
}

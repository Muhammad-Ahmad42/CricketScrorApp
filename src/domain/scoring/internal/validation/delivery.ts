import {
  DELIVERY_DISMISSAL_TYPES,
  type DeliveryCall,
  type DeliveryDismissalType,
  type DeliveryPayload,
  type InningsState,
  type MatchSetup,
  type MatchState,
  type ValidationMode,
  type ValidationResult,
  type ValidationWarning,
} from '../../../types';
import { deliveryFigures } from '../delivery';
import { incomingBatters, inProgressInnings, isAtCrease, loneAtWickets } from '../eligibility';
import { isInt, isIntIn, isOneOf } from '../guards';
import { isFieldingPlayer, playerName } from '../squad';
import { stampsMatch } from '../stamps';
import { fail, pass, pendingMessage } from './common';

const STRIKER_ONLY: readonly DeliveryDismissalType[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket', 'hit_ball_twice'];
const NEEDS_END: readonly DeliveryDismissalType[] = ['run_out', 'obstructing_field', 'handled_ball'];
const FREE_HIT_ALLOWED: readonly DeliveryDismissalType[] = ['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball'];

const BY_CALL: Readonly<Record<DeliveryCall, readonly DeliveryDismissalType[]>> = {
  fair: DELIVERY_DISMISSAL_TYPES,
  wide: ['stumped', 'hit_wicket', 'run_out', 'obstructing_field', 'handled_ball'],
  no_ball: ['run_out', 'hit_ball_twice', 'obstructing_field', 'handled_ball'],
};

export function dismissalsFor(call: DeliveryCall, isFreeHit: boolean): readonly DeliveryDismissalType[] {
  const byCall = BY_CALL[call];
  return isFreeHit ? byCall.filter((type) => FREE_HIT_ALLOWED.includes(type)) : byCall;
}

export function isStrikerOnly(type: DeliveryDismissalType): boolean {
  return STRIKER_ONLY.includes(type);
}

function factsFailure(delivery: DeliveryPayload): ValidationResult | null {
  if (!isIntIn(delivery.runsRun, 0, 9)) {
    return fail('INVALID_RUNS', 'Runs run must be a whole number from 0 to 9.');
  }
  if (!isInt(delivery.shortRuns) || delivery.shortRuns < 0 || delivery.shortRuns > delivery.runsRun) {
    return fail('INVALID_SHORT_RUNS', "Short runs can't be more than the runs the batters ran.");
  }
  if (delivery.boundary !== 0 && delivery.boundary !== 4 && delivery.boundary !== 6) {
    return fail('INVALID_BOUNDARY', 'A boundary must be a four or a six.');
  }
  if (delivery.boundary === 6 && (delivery.call === 'wide' || delivery.runsTo !== 'bat')) {
    return fail('SIX_NOT_OFF_BAT', 'A six can only be scored off the bat. Byes, leg byes and wides can only go for four.');
  }
  return null;
}

function wicketFailure(setup: MatchSetup, innings: InningsState, delivery: DeliveryPayload): ValidationResult | null {
  const wicket = delivery.wicket;
  if (wicket === null) {
    return null;
  }
  if (!isOneOf(DELIVERY_DISMISSAL_TYPES, wicket.type) || !BY_CALL[delivery.call].includes(wicket.type)) {
    return fail('DISMISSAL_NOT_ALLOWED_ON_CALL', `A batter can't be out that way off a ${callWords(delivery.call)}.`);
  }
  if (innings.isFreeHitNext && !FREE_HIT_ALLOWED.includes(wicket.type)) {
    return fail('DISMISSAL_NOT_ALLOWED_ON_FREE_HIT', 'On a free hit the batter can only be run out, hit the ball twice, obstruct the field or handle the ball.');
  }
  if (isStrikerOnly(wicket.type)) {
    if (delivery.runsRun !== 0 || delivery.boundary !== 0) {
      return fail('RUNS_NOT_ALLOWED_WITH_DISMISSAL', "No runs can be scored off the bat on a ball where the striker is out that way.");
    }
    if (wicket.playerOutId !== innings.strikerId) {
      return fail('DISMISSED_PLAYER_NOT_AT_CREASE', `Only the striker, ${playerName(setup, innings.strikerId)}, can be out that way.`);
    }
    if (wicket.dismissalEnd !== null) {
      return fail('DISMISSAL_END_NOT_ALLOWED', "Don't choose an end for this kind of dismissal.");
    }
  } else {
    if (!isAtCrease(innings, wicket.playerOutId)) {
      return fail('DISMISSED_PLAYER_NOT_AT_CREASE', "That batter isn't at the crease.");
    }
    if (NEEDS_END.includes(wicket.type) && wicket.dismissalEnd === null) {
      return fail('DISMISSAL_END_REQUIRED', 'Choose the end where the wicket was put down.');
    }
  }
  if (wicket.fielderIds.length > 2) {
    return fail('TOO_MANY_FIELDERS', 'Choose at most two fielders.');
  }
  if (!wicket.fielderIds.every((id) => isFieldingPlayer(setup, innings.bowlingTeamId, id))) {
    return fail('FIELDER_NOT_IN_FIELDING_SIDE', 'Fielders must be players of the fielding side.');
  }
  if (innings.target !== null && innings.runs + deliveryFigures(setup.rules, delivery).totalRuns >= innings.target.runs) {
    return fail('WICKET_AFTER_RESULT', "The winning run was already scored on this ball, so this wicket doesn't count.");
  }
  return null;
}

function callWords(call: DeliveryCall): string {
  switch (call) {
    case 'fair':
      return 'fair delivery';
    case 'wide':
      return 'wide';
    case 'no_ball':
      return 'no ball';
    default: {
      const unreachable: never = call;
      return unreachable;
    }
  }
}

function deliveryWarnings(setup: MatchSetup, state: MatchState, innings: InningsState, delivery: DeliveryPayload): readonly ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const running = delivery.runsRun - delivery.shortRuns;
  if (running >= 5 && delivery.boundary === 0) {
    warnings.push({ code: 'UNUSUAL_RUNS', message: `${running} runs without a boundary — is that right?` });
  }
  const wicket = delivery.wicket;
  if (wicket !== null && (wicket.type === 'caught' || wicket.type === 'stumped') && wicket.fielderIds.length === 0) {
    warnings.push({ code: 'FIELDER_UNKNOWN', message: 'No fielder was recorded for this dismissal.' });
  }
  if (wicket !== null) {
    const wicketsAfter = innings.wickets + 1;
    const needsBatter = wicketsAfter < innings.limits.maxWickets && !loneAtWickets(setup, innings, wicketsAfter);
    if (needsBatter && incomingBatters(setup, state, innings).length === 0) {
      warnings.push({ code: 'SQUAD_EXHAUSTED', message: 'No batter is left to come in. Add a player or end the innings.' });
    }
  }
  return warnings;
}

export function validateDelivery(setup: MatchSetup, state: MatchState, delivery: DeliveryPayload, mode: ValidationMode): ValidationResult {
  const innings = inProgressInnings(state);
  if (innings === null || state.pendingAction !== null) {
    return fail('PENDING_ACTION_REQUIRED', pendingMessage(state));
  }
  if (mode === 'append' && !stampsMatch(innings, delivery)) {
    return fail('CONTEXT_MISMATCH', 'The batters or bowler on this ball do not match the current scorecard. Refresh and try again.');
  }
  const facts = factsFailure(delivery);
  if (facts !== null) {
    return facts;
  }
  const wicket = wicketFailure(setup, innings, delivery);
  if (wicket !== null) {
    return wicket;
  }
  return pass(deliveryWarnings(setup, state, innings, delivery));
}

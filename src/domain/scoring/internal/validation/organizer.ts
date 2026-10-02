import type {
  MatchEndedPayload,
  MatchSetup,
  MatchState,
  OversRevisedPayload,
  PenaltyAwardedPayload,
  PowerplayRule,
  ValidationResult,
  ValidationWarning,
} from '../../../types';
import { isInt, isRecord, isString } from '../guards';
import { penaltyPlacementValid } from '../phase';
import { isTeamInMatch } from '../squad';
import { fail, pass } from './common';

export function validatePenalty(setup: MatchSetup, state: MatchState, event: PenaltyAwardedPayload): ValidationResult {
  if (!isTeamInMatch(setup, event.teamId)) {
    return fail('TEAM_NOT_IN_MATCH', "That team isn't playing in this match.");
  }
  if (!isInt(event.runs) || event.runs < 1 || event.runs > 99) {
    return fail('INVALID_PENALTY', 'Penalty runs must be a whole number from 1 to 99.');
  }
  if (!isInt(event.inningsIndex) || !penaltyPlacementValid(setup, state, event.teamId, event.inningsIndex)) {
    return fail('INVALID_PENALTY_INNINGS', "Penalty runs can't be added to that innings.");
  }
  return pass();
}

function powerplaysValid(powerplays: readonly PowerplayRule[] | undefined): boolean {
  if (powerplays === undefined) {
    return true;
  }
  return powerplays.every(
    (phase) => isRecord(phase) && isString(phase.name) && isInt(phase.fromOver) && isInt(phase.toOver) && phase.fromOver >= 1 && phase.toOver >= phase.fromOver,
  );
}

function revisionInnings(state: MatchState, inningsIndex: number): { readonly legalBalls: number; readonly maxBalls: number | null; readonly started: boolean } | null {
  const innings = state.innings[inningsIndex];
  if (innings !== undefined) {
    if (innings.status === 'complete') {
      return null;
    }
    return { legalBalls: innings.legalBalls, maxBalls: innings.limits.maxBalls, started: true };
  }
  const planned = state.plannedRevisions.find((entry) => entry.inningsIndex === inningsIndex);
  return { legalBalls: 0, maxBalls: planned?.revision.maxBalls ?? null, started: false };
}

export function validateOversRevised(setup: MatchSetup, state: MatchState, event: OversRevisedPayload): ValidationResult {
  const index = event.inningsIndex;
  if (!isInt(index) || index < 0 || index > 1) {
    return fail('WRONG_INNINGS_INDEX', 'Overs can only be revised for the current innings or a regular innings still to come.');
  }
  const target = revisionInnings(state, index);
  if (target === null) {
    return fail('INVALID_OVERS_REVISION', "A completed innings can't be revised.");
  }
  if (!isInt(event.maxBalls) || event.maxBalls < 1 || event.maxBalls < target.legalBalls) {
    return fail('INVALID_OVERS_REVISION', "The new limit can't be less than the balls already bowled.");
  }
  if (event.terminal) {
    const chaseInProgress = index === 1 && target.started;
    if (!chaseInProgress || event.maxBalls !== target.legalBalls || event.target === null) {
      return fail('INVALID_OVERS_REVISION', 'Ending play for good needs the chase in progress, the balls bowled so far and a par target.');
    }
  }
  if (event.target !== null) {
    if (index !== 1) {
      return fail('INVALID_TARGET', 'A target can only be set for the chasing innings.');
    }
    if (!isInt(event.target) || event.target < 1) {
      return fail('INVALID_TARGET', 'The target must be a whole number of at least 1.');
    }
  }
  if (event.maxOversPerBowler !== undefined && event.maxOversPerBowler !== null && (!isInt(event.maxOversPerBowler) || event.maxOversPerBowler < 1)) {
    return fail('INVALID_OVERS_REVISION', 'The overs per bowler must be at least 1.');
  }
  if (!powerplaysValid(event.powerplays)) {
    return fail('INVALID_OVERS_REVISION', 'Each powerplay needs a first and last over.');
  }
  const warnings: ValidationWarning[] = [];
  const currentMax = target.maxBalls ?? setup.rules.oversPerInnings * setup.rules.ballsPerOver;
  if (index === 0 && event.maxBalls < currentMax) {
    const chasePlanned = state.innings[1] !== undefined || state.plannedRevisions.some((entry) => entry.inningsIndex === 1);
    if (!chasePlanned) {
      warnings.push({ code: 'CHASE_OVERS_NOT_REVISED', message: "The chasing side's overs have not been revised yet." });
    }
  }
  if (event.target !== null && event.maxBalls === currentMax && !event.terminal) {
    warnings.push({ code: 'TARGET_REVISION_WITHOUT_OVERS_CHANGE', message: 'The target changed but the overs did not.' });
  }
  return pass(warnings);
}

export function validatePlayResumed(state: MatchState): ValidationResult {
  return state.lifecycle === 'paused' ? pass() : fail('NOT_SUSPENDED', 'Play is not suspended.');
}

function anyDelivery(state: MatchState): boolean {
  return state.innings.some((innings) => innings.balls.length > 0);
}

export function validateMatchEnded(setup: MatchSetup, state: MatchState, event: MatchEndedPayload): ValidationResult {
  const outcome = event.outcome;
  switch (outcome.type) {
    case 'natural':
      return state.naturalResult === null
        ? fail('NATURAL_RESULT_NOT_REACHED', 'The match has no result yet.')
        : pass();
    case 'tie_decided': {
      const natural = state.naturalResult;
      if (natural === null || natural.type !== 'tie' || natural.decider !== null) {
        return fail('RESULT_NOT_TIED', 'Only a tied match can be decided this way.');
      }
      return isTeamInMatch(setup, outcome.winnerTeamId) ? pass() : fail('TEAM_NOT_IN_MATCH', "That team isn't playing in this match.");
    }
    case 'no_result':
      return state.innings.length === 0 ? fail('MATCH_NOT_STARTED', 'The match has not started yet. Record it as abandoned instead.') : pass();
    case 'abandoned':
      return pass();
    case 'walkover':
      if (anyDelivery(state)) {
        return fail('WALKOVER_AFTER_PLAY', 'A walkover is only possible before any ball is bowled. Award the match instead.');
      }
      return isTeamInMatch(setup, outcome.winnerTeamId) ? pass() : fail('TEAM_NOT_IN_MATCH', "That team isn't playing in this match.");
    case 'awarded':
      if (outcome.winnerTeamId !== null && !isTeamInMatch(setup, outcome.winnerTeamId)) {
        return fail('TEAM_NOT_IN_MATCH', "That team isn't playing in this match.");
      }
      return pass();
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

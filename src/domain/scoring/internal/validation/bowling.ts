import type { BowlerSelectedPayload, MatchSetup, MatchState, ValidationResult, ValidationWarning } from '../../../types';
import { bowlerBarredFromSuperOver, hasVacancy, replacedThisOver } from '../eligibility';
import { quotaReached, startsFinalQuotaOver } from '../limits';
import { playerName } from '../squad';
import { fail, isValidationResult, pass, requireInningsInProgress, squadFailure } from './common';

export function validateBowlerSelected(setup: MatchSetup, state: MatchState, event: BowlerSelectedPayload): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  if (hasVacancy(setup, innings)) {
    return fail('VACANCY_MUST_BE_FILLED', 'Choose the next batter first.');
  }
  const squad = squadFailure(setup, innings.bowlingTeamId, event.bowlerId, 'bowler');
  if (squad !== null) {
    return squad;
  }
  const name = playerName(setup, event.bowlerId);
  const atOverStart = innings.currentOver === null;
  if (event.reason === 'over_start') {
    if (!atOverStart) {
      return fail('BOWLER_CHANGE_REASON_INVALID', 'This over has already started. Choose injury or suspension as the reason for a change.');
    }
  } else if (event.reason === 'injury' || event.reason === 'suspended') {
    if (atOverStart) {
      return fail('BOWLER_CHANGE_REASON_INVALID', 'No ball of this over has been bowled yet, so just choose the bowler for the over.');
    }
    if (event.bowlerId === innings.bowlerId) {
      return fail('BOWLER_CHANGE_REASON_INVALID', `${name} is already bowling this over.`);
    }
    if (replacedThisOver(innings).includes(event.bowlerId)) {
      return fail('BOWLER_ALREADY_REPLACED', `${name} was already replaced in this over.`);
    }
  } else {
    return fail('BOWLER_CHANGE_REASON_INVALID', 'Choose why the bowler is changing.');
  }
  if (innings.removedBowlerIds.includes(event.bowlerId)) {
    return fail('BOWLER_REMOVED_FROM_ATTACK', `${name} was removed from the attack and can't bowl again in this innings.`);
  }
  if (!setup.rules.allowBowlerConsecutiveOvers && innings.previousOverBowlerIds.includes(event.bowlerId)) {
    return fail('BOWLER_CONSECUTIVE_OVERS', `${name} bowled the previous over and can't bowl two overs in a row.`);
  }
  if (quotaReached(innings.limits, innings.bowling, event.bowlerId)) {
    return fail('BOWLER_QUOTA_REACHED', `${name} has bowled the maximum number of overs.`);
  }
  if (bowlerBarredFromSuperOver(setup, state, innings, event.bowlerId)) {
    return fail('PLAYER_INELIGIBLE_SUPER_OVER', `${name} bowled the previous super over and can't bowl this one.`);
  }
  const warnings: ValidationWarning[] = [];
  if (startsFinalQuotaOver(innings.limits, innings.bowling, event.bowlerId)) {
    warnings.push({ code: 'BOWLER_QUOTA_LAST_OVER', message: `This is ${name}'s last allowed over.` });
  }
  return pass(warnings);
}

import type {
  BatterDismissedPayload,
  BatterInPayload,
  BatterRetiredPayload,
  InningsEndedPayload,
  MatchSetup,
  MatchState,
  ValidationResult,
  ValidationWarning,
} from '../../../types';
import {
  batterBarredFromSuperOver,
  batterStatus,
  hasVacancy,
  incomingBatters,
  isAtCrease,
  isLoneMode,
  loneAtWickets,
  retiredNotOutMayReturn,
  vacancies,
  yetToBatRemain,
} from '../eligibility';
import { findPlayer, isFieldingPlayer, playerName } from '../squad';
import { fail, isValidationResult, pass, requireInningsInProgress, squadFailure } from './common';

export function validateBatterIn(setup: MatchSetup, state: MatchState, event: BatterInPayload): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  const open = vacancies(setup, innings);
  if (open.length === 0) {
    return fail('NO_VACANCY', 'Both batters are already at the crease.');
  }
  if (!open.includes(event.position)) {
    return fail('POSITION_NOT_VACANT', `The ${event.position === 'striker' ? "striker's" : "non-striker's"} end is not vacant.`);
  }
  const squad = squadFailure(setup, innings.battingTeamId, event.playerId, 'batter');
  if (squad !== null) {
    return squad;
  }
  const name = playerName(setup, event.playerId);
  if (isAtCrease(innings, event.playerId)) {
    return fail('BATTER_ALREADY_BATTING', `${name} is already batting.`);
  }
  const status = batterStatus(innings, event.playerId);
  if (status === 'out') {
    return fail('BATTER_ALREADY_OUT', `${name} is already out.`);
  }
  if (status === 'absent') {
    return fail('BATTER_NOT_ELIGIBLE', `${name} was marked absent.`);
  }
  if (status === 'retired_not_out' && !retiredNotOutMayReturn(setup, yetToBatRemain(setup, state, innings))) {
    return fail('BATTER_NOT_ELIGIBLE', `${name} retired and can only return once every other batter has batted.`);
  }
  if (batterBarredFromSuperOver(setup, state, innings, event.playerId)) {
    return fail('PLAYER_INELIGIBLE_SUPER_OVER', `${name} was dismissed in an earlier super over and can't bat again.`);
  }
  const warnings: ValidationWarning[] = [];
  const remaining = incomingBatters(setup, state, innings).filter((playerId) => playerId !== event.playerId);
  const wicketsAfter = innings.wickets + 1;
  const bothFilled = open.length === 1;
  if (bothFilled && remaining.length === 0 && wicketsAfter < innings.limits.maxWickets && !loneAtWickets(setup, innings, wicketsAfter)) {
    warnings.push({ code: 'SQUAD_EXHAUSTED', message: 'This is the last available batter. Add a player if more are coming.' });
  }
  return pass(warnings);
}

export function validateStrikeSwapped(setup: MatchSetup, state: MatchState): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  if (hasVacancy(setup, innings)) {
    return fail('VACANCY_MUST_BE_FILLED', 'Choose the next batter first.');
  }
  if (isLoneMode(setup, innings) || innings.nonStrikerId === null) {
    return fail('NOTHING_TO_SWAP', 'Only one batter is at the crease.');
  }
  return pass();
}

export function validateBatterRetired(setup: MatchSetup, state: MatchState, event: BatterRetiredPayload): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  if (hasVacancy(setup, innings)) {
    return fail('VACANCY_MUST_BE_FILLED', 'Choose the next batter first.');
  }
  if (!isAtCrease(innings, event.playerId)) {
    return fail('BATTER_NOT_AT_CREASE', `${playerName(setup, event.playerId)} isn't at the crease.`);
  }
  return pass();
}

export function validateBatterDismissed(setup: MatchSetup, state: MatchState, event: BatterDismissedPayload): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  const name = playerName(setup, event.playerId);
  if (event.type === 'timed_out') {
    if (!hasVacancy(setup, innings)) {
      return fail('NO_VACANCY', 'A batter can only be timed out while the next batter is due.');
    }
    const squad = squadFailure(setup, innings.battingTeamId, event.playerId, 'batter');
    if (squad !== null) {
      return squad;
    }
    if (isAtCrease(innings, event.playerId)) {
      return fail('BATTER_ALREADY_BATTING', `${name} is already batting.`);
    }
    if (batterStatus(innings, event.playerId) === 'out') {
      return fail('BATTER_ALREADY_OUT', `${name} is already out.`);
    }
    if (!incomingBatters(setup, state, innings).includes(event.playerId)) {
      return fail('BATTER_NOT_ELIGIBLE', `${name} isn't due to bat now.`);
    }
  } else {
    if (hasVacancy(setup, innings)) {
      return fail('VACANCY_MUST_BE_FILLED', 'Choose the next batter first.');
    }
    if (!isAtCrease(innings, event.playerId)) {
      return fail('BATTER_NOT_AT_CREASE', `${name} isn't at the crease.`);
    }
  }
  if (event.fielderIds.length > 2) {
    return fail('TOO_MANY_FIELDERS', 'Choose at most two fielders.');
  }
  if (!event.fielderIds.every((id) => isFieldingPlayer(setup, innings.bowlingTeamId, id))) {
    return fail('FIELDER_NOT_IN_FIELDING_SIDE', 'Fielders must be players of the fielding side.');
  }
  return pass();
}

export function validateInningsEnded(setup: MatchSetup, state: MatchState, event: InningsEndedPayload): ValidationResult {
  const innings = requireInningsInProgress(state);
  if (isValidationResult(innings)) {
    return innings;
  }
  if (event.reason === 'declared') {
    return event.absentees.length === 0 ? pass() : fail('INVALID_ABSENTEE', "A declared innings can't have absent batters.");
  }
  const seen = new Set<string>();
  for (const absentee of event.absentees) {
    const player = findPlayer(setup, absentee.playerId);
    if (player === undefined || player.teamId !== innings.battingTeamId || player.isSubstitute || seen.has(absentee.playerId)) {
      return fail('INVALID_ABSENTEE', 'Absent batters must be players of the batting side, each named once.');
    }
    seen.add(absentee.playerId);
    const status = batterStatus(innings, absentee.playerId);
    if (isAtCrease(innings, absentee.playerId) || (status !== 'yet_to_bat' && status !== 'retired_hurt')) {
      return fail('INVALID_ABSENTEE', `${player.name} has already batted and can't be marked absent.`);
    }
  }
  return pass();
}

import type {
  InningsStartedPayload,
  MatchSetup,
  MatchState,
  SuperOverStartedPayload,
  ValidationResult,
  ValidationWarning,
} from '../../../types';
import { dismissedInEarlierSuperOvers, inProgressInnings, previousSuperOverBowlers } from '../eligibility';
import { isInt } from '../guards';
import { battingSquad, isTeamInMatch, otherTeamId, playerName, playersInSide, teamName } from '../squad';
import { fail, pass, squadFailure } from './common';

function tossFailure(setup: MatchSetup, event: InningsStartedPayload): ValidationResult | null {
  const toss = setup.toss;
  if (toss === null || event.inningsIndex !== 0) {
    return null;
  }
  const expected = toss.decision === 'bat' ? toss.winnerTeamId : otherTeamId(setup, toss.winnerTeamId);
  if (expected !== event.battingTeamId) {
    return fail('TOSS_MISMATCH', `${teamName(setup, expected)} should bat first according to the toss.`);
  }
  return null;
}

function superOverPlayersFailure(setup: MatchSetup, state: MatchState, event: InningsStartedPayload): ValidationResult | null {
  const round = Math.floor(event.inningsIndex / 2);
  if (event.inningsIndex < 2 || round < 2 || !setup.rules.superOver.restrictRepeatPlayers) {
    return null;
  }
  const dismissed = dismissedInEarlierSuperOvers(state, round);
  for (const opener of [event.strikerId, event.nonStrikerId]) {
    if (dismissed.has(opener)) {
      return fail('PLAYER_INELIGIBLE_SUPER_OVER', `${playerName(setup, opener)} was dismissed in an earlier super over and can't bat again.`);
    }
  }
  if (previousSuperOverBowlers(state, round).has(event.bowlerId)) {
    return fail('PLAYER_INELIGIBLE_SUPER_OVER', `${playerName(setup, event.bowlerId)} bowled the previous super over and can't bowl this one.`);
  }
  return null;
}

export function validateInningsStarted(setup: MatchSetup, state: MatchState, event: InningsStartedPayload): ValidationResult {
  if (inProgressInnings(state) !== null) {
    return fail('INNINGS_STILL_IN_PROGRESS', 'The current innings is still in progress.');
  }
  const expectedIndex = state.innings.length;
  if (!isInt(event.inningsIndex) || event.inningsIndex !== expectedIndex) {
    return fail('WRONG_INNINGS_INDEX', 'This is not the next innings of the match.');
  }
  if (event.inningsIndex >= 2 && state.superOverRound !== Math.floor(event.inningsIndex / 2)) {
    return fail('SUPER_OVER_NOT_STARTED', 'Start the super over before its innings.');
  }
  if (!isTeamInMatch(setup, event.battingTeamId)) {
    return fail('TEAM_NOT_IN_MATCH', "That team isn't playing in this match.");
  }
  if (event.inningsIndex % 2 === 1) {
    const partner = state.innings[event.inningsIndex - 1];
    if (partner !== undefined && partner.battingTeamId === event.battingTeamId) {
      return fail('WRONG_BATTING_TEAM', `${teamName(setup, otherTeamId(setup, event.battingTeamId))} must bat in this innings.`);
    }
  }
  const toss = tossFailure(setup, event);
  if (toss !== null) {
    return toss;
  }
  const bowlingTeamId = otherTeamId(setup, event.battingTeamId);
  for (const opener of [event.strikerId, event.nonStrikerId]) {
    const squad = squadFailure(setup, event.battingTeamId, opener, 'batter');
    if (squad !== null) {
      return squad;
    }
  }
  if (event.strikerId === event.nonStrikerId) {
    return fail('SAME_PLAYER_BOTH_ENDS', 'Choose two different opening batters.');
  }
  const bowler = squadFailure(setup, bowlingTeamId, event.bowlerId, 'bowler');
  if (bowler !== null) {
    return bowler;
  }
  const superOver = superOverPlayersFailure(setup, state, event);
  if (superOver !== null) {
    return superOver;
  }
  const warnings: ValidationWarning[] = [];
  if (battingSquad(setup, event.battingTeamId).length < playersInSide(setup, event.battingTeamId)) {
    warnings.push({
      code: 'SQUAD_EXHAUSTED',
      message: `${teamName(setup, event.battingTeamId)} has fewer players in the squad than the side size.`,
    });
  }
  return pass(warnings);
}

export function validateSuperOverStarted(setup: MatchSetup, state: MatchState, event: SuperOverStartedPayload): ValidationResult {
  const rule = setup.rules.superOver;
  if (!rule.enabled) {
    return fail('SUPER_OVER_NOT_ALLOWED', 'Super overs are turned off for this match.');
  }
  const natural = state.naturalResult;
  if (natural === null || natural.type !== 'tie' || natural.decider !== null) {
    return fail('RESULT_NOT_TIED', 'A super over can only be played when the match is tied.');
  }
  const expectedRound = (state.superOverRound ?? 0) + 1;
  if (!isInt(event.round) || event.round !== expectedRound) {
    return fail('WRONG_INNINGS_INDEX', `The next super over is round ${expectedRound}.`);
  }
  if (event.round >= 2 && rule.ifTiedAgain !== 'repeat') {
    return fail('SUPER_OVER_NOT_ALLOWED', 'Another super over is not allowed when the super over is tied.');
  }
  if (rule.maxRounds !== null && event.round > rule.maxRounds) {
    return fail('SUPER_OVER_LIMIT_REACHED', 'The maximum number of super overs has been played.');
  }
  return pass();
}

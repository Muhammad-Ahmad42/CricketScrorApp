import type { InningsState, MatchResult, MatchSetup, MatchState, PendingAction, PlayerId, TeamId } from '../../types';
import { formatResult } from '../result';
import {
  batterStatus,
  bowlerEligibilityOf,
  incomingBatters,
  inProgressInnings,
  isLoneMode,
  yetToBatRemain,
} from './eligibility';
import { otherTeamId } from './squad';

export function resultTextFor(setup: MatchSetup, state: Pick<MatchState, 'innings'>, result: MatchResult): string {
  const text = formatResult(result, setup.teams);
  const chase = state.innings[1];
  if (result.type === 'tie' && result.decider === null && chase?.completion?.reason === 'terminated') {
    return `${text} (par score)`;
  }
  return text;
}

export function suggestedBattingTeam(setup: MatchSetup, state: Pick<MatchState, 'innings'>, index: number): TeamId | null {
  if (index === 0) {
    const toss = setup.toss;
    if (toss === null) {
      return null;
    }
    return toss.decision === 'bat' ? toss.winnerTeamId : otherTeamId(setup, toss.winnerTeamId);
  }
  if (index % 2 === 1) {
    const partner = state.innings[index - 1];
    return partner === undefined ? null : otherTeamId(setup, partner.battingTeamId);
  }
  return state.innings[index - 1]?.battingTeamId ?? null;
}

function tieOptions(setup: MatchSetup, state: MatchState): PendingAction {
  const rule = setup.rules.superOver;
  const nextRound = (state.superOverRound ?? 0) + 1;
  const allowed =
    rule.enabled && (rule.maxRounds === null || nextRound <= rule.maxRounds) && (nextRound === 1 || rule.ifTiedAgain === 'repeat');
  return {
    type: 'resolve_tie',
    options: allowed ? ['super_over', 'accept_tie', 'decide_other'] : ['accept_tie', 'decide_other'],
    nextSuperOverRound: allowed ? nextRound : null,
  };
}

function nextBatterPrompt(setup: MatchSetup, state: MatchState, innings: InningsState): PendingAction {
  const candidates = incomingBatters(setup, state, innings);
  const onlyReturning = candidates.every((playerId) => batterStatus(innings, playerId) !== 'yet_to_bat');
  return {
    type: 'select_next_batter',
    position: innings.strikerId === null ? 'striker' : 'non_striker',
    candidates,
    canEndInnings: candidates.length === 0 || onlyReturning,
  };
}

export function derivePendingAction(setup: MatchSetup, state: MatchState): PendingAction | null {
  if (state.lifecycle === 'completed' || state.lifecycle === 'abandoned' || state.result !== null) {
    return null;
  }
  const natural = state.naturalResult;
  if (natural !== null) {
    if (natural.type === 'tie' && natural.decider === null) {
      return tieOptions(setup, state);
    }
    return { type: 'confirm_result', result: natural, text: resultTextFor(setup, state, natural) };
  }
  if (state.suspension !== null) {
    return { type: 'resume_play', reason: state.suspension.reason };
  }
  const innings = inProgressInnings(state);
  if (innings === null) {
    const index = state.innings.length;
    const kind = index <= 1 ? 'regular' : 'super_over';
    return {
      type: 'start_next_innings',
      inningsIndex: index,
      kind,
      superOverRound: kind === 'super_over' ? Math.floor(index / 2) : null,
      suggestedBattingTeamId: suggestedBattingTeam(setup, state, index),
    };
  }
  if (innings.strikerId === null || (innings.nonStrikerId === null && !isLoneMode(setup, innings))) {
    return nextBatterPrompt(setup, state, innings);
  }
  if (innings.bowlerId === null) {
    const eligibility = bowlerEligibilityOf(setup, state, innings);
    return {
      type: 'select_next_bowler',
      overIndex: Math.floor(innings.legalBalls / setup.rules.ballsPerOver),
      eligible: eligibility.eligible,
      ineligible: eligibility.ineligible,
    };
  }
  return null;
}

export function deriveRetirementsDue(
  setup: MatchSetup,
  state: MatchState,
): readonly { readonly playerId: PlayerId; readonly atRuns: number }[] {
  const rule = setup.rules.mandatoryRetirement;
  const innings = inProgressInnings(state);
  if (rule === null || innings === null) {
    return [];
  }
  if (rule.timing === 'end_of_over') {
    const atOverEnd = innings.legalBalls > 0 && innings.legalBalls % setup.rules.ballsPerOver === 0 && innings.currentOver === null;
    if (!atOverEnd) {
      return [];
    }
  }
  if (!yetToBatRemain(setup, state, innings)) {
    return [];
  }
  const due: { playerId: PlayerId; atRuns: number }[] = [];
  for (const playerId of [innings.strikerId, innings.nonStrikerId]) {
    if (playerId === null) {
      continue;
    }
    const row = innings.batting.find((candidate) => candidate.playerId === playerId);
    if (row !== undefined && !row.returnedFromRetirement && row.runs >= rule.atRuns) {
      due.push({ playerId, atRuns: rule.atRuns });
    }
  }
  return due;
}

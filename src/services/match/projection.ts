import { buildMatchSummary, deriveMatchStatus, resultWinner, SCORING_PROJECTION_VERSION } from '@/domain/scoring';
import type { IsoDateTime, Match, MatchEvent, MatchSetup, MatchState, MatchStatus, MatchSummary } from '@/domain/types';
import type { MatchProjection } from '@/db';

const PRE_PLAY: readonly MatchStatus[] = ['scheduled', 'postponed', 'cancelled'];

export function projectedStatus(state: MatchState, stored: MatchStatus): MatchStatus {
  if (state.lifecycle === 'not_started') {
    return PRE_PLAY.includes(stored) ? stored : 'scheduled';
  }
  return deriveMatchStatus(state, stored);
}

export function isTerminal(state: MatchState): boolean {
  return state.lifecycle === 'completed' || state.lifecycle === 'abandoned';
}

function completionTime(events: readonly MatchEvent[], state: MatchState): IsoDateTime | null {
  if (!isTerminal(state)) {
    return null;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].kind === 'match_ended') {
      return events[index].recordedAt;
    }
  }
  return events[events.length - 1]?.recordedAt ?? null;
}

function startTime(events: readonly MatchEvent[], state: MatchState): IsoDateTime | null {
  if (state.lifecycle === 'not_started') {
    return null;
  }
  return events[0]?.recordedAt ?? null;
}

export function summaryOf(setup: MatchSetup, events: readonly MatchEvent[], state: MatchState): MatchSummary | null {
  return buildMatchSummary(setup, state, { completedAt: completionTime(events, state) });
}

export interface ProjectionInput {
  readonly match: Match;
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
  readonly now: IsoDateTime;
}

export function buildProjection(input: ProjectionInput): MatchProjection {
  const { match, setup, events, state } = input;
  const result = isTerminal(state) ? state.result : null;
  return {
    matchId: match.id,
    projectionVersion: SCORING_PROJECTION_VERSION,
    status: projectedStatus(state, match.status),
    result,
    winnerTeamId: result === null ? null : resultWinner(result),
    summary: summaryOf(setup, events, state),
    startedAt: startTime(events, state),
    completedAt: completionTime(events, state),
    innings: state.innings.map((innings) => ({
      inningsIndex: innings.index,
      kind: innings.kind,
      battingTeamId: innings.battingTeamId,
      runs: innings.runs,
      wickets: innings.wickets,
      legalBalls: innings.legalBalls,
      ballsPerOver: setup.rules.ballsPerOver,
      status: innings.status,
      completionReason: innings.completion?.reason ?? null,
      superOverRound: innings.superOverRound,
      bowlingTeamId: innings.bowlingTeamId,
      maxBalls: innings.limits.maxBalls,
      target: innings.target?.runs ?? null,
      targetRevised: innings.target?.revised ?? false,
      extras: innings.extras,
    })),
    partnerships: state.innings.flatMap((innings) => innings.partnerships.map((partnership) => ({ ...partnership, inningsIndex: innings.index }))),
    updatedAt: input.now,
  };
}

export function matchWithState(match: Match, events: readonly MatchEvent[], state: MatchState): Match {
  const result = isTerminal(state) ? state.result : null;
  return {
    ...match,
    status: projectedStatus(state, match.status),
    result,
    winnerTeamId: result === null ? null : resultWinner(result),
    startedAt: startTime(events, state),
    completedAt: completionTime(events, state),
  };
}

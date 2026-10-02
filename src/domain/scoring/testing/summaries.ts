import type { BallCount, InningsSummary, MatchResult, MatchSummary, TeamId } from '../../types';
import { resultWinner } from '../result';
import { LIONS, TIGERS } from './fixtures';

type WinMethod = Extract<MatchResult, { readonly type: 'win' }>['method'];

export function inningsSummary(partial: Partial<InningsSummary> = {}): InningsSummary {
  const battingTeamId = partial.battingTeamId ?? LIONS;
  return {
    inningsIndex: 0,
    battingTeamId,
    bowlingTeamId: partial.bowlingTeamId ?? (battingTeamId === LIONS ? TIGERS : LIONS),
    runs: 0,
    wickets: 0,
    legalBalls: 120,
    allottedBalls: 120,
    ballsPerOver: 6,
    allOut: false,
    completion: 'overs_complete',
    target: null,
    targetRevised: false,
    extras: 0,
    fours: 0,
    sixes: 0,
    batting: [],
    bowling: [],
    bestPartnership: null,
    ...partial,
  };
}

export function winByRuns(winnerTeamId: TeamId, loserTeamId: TeamId, runs: number, method: WinMethod = 'normal'): MatchResult {
  return { type: 'win', winnerTeamId, loserTeamId, margin: { kind: 'runs', runs }, method };
}

export function winByWickets(
  winnerTeamId: TeamId,
  loserTeamId: TeamId,
  wickets: number,
  ballsRemaining: BallCount = 0,
  method: WinMethod = 'normal',
): MatchResult {
  return { type: 'win', winnerTeamId, loserTeamId, margin: { kind: 'wickets', wickets, ballsRemaining }, method };
}

export function tied(decidedBy?: { readonly method: 'super_over' | 'boundary_count' | 'bowl_out' | 'coin_toss' | 'organizer'; readonly winnerTeamId: TeamId; readonly superOverRounds?: number }): MatchResult {
  if (decidedBy === undefined) {
    return { type: 'tie', decider: null };
  }
  return {
    type: 'tie',
    decider: {
      method: decidedBy.method,
      winnerTeamId: decidedBy.winnerTeamId,
      superOverRounds: decidedBy.superOverRounds ?? (decidedBy.method === 'super_over' ? 1 : 0),
    },
  };
}

export function noResult(reason: string | null = null): MatchResult {
  return { type: 'no_result', reason };
}

export function abandonedResult(reason: string | null = null): MatchResult {
  return { type: 'abandoned', reason };
}

export function walkover(winnerTeamId: TeamId, loserTeamId: TeamId, reason: string | null = null): MatchResult {
  return { type: 'walkover', winnerTeamId, loserTeamId, reason };
}

export function summary(partial: Partial<MatchSummary> = {}): MatchSummary {
  const teamAId = partial.teamAId ?? LIONS;
  const teamBId = partial.teamBId ?? TIGERS;
  const result = partial.result ?? winByRuns(teamAId, teamBId, 10);
  return {
    summaryVersion: 2,
    matchId: 'M1',
    teamAId,
    teamBId,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: resultWinner(result),
    ballsPerOver: 6,
    innings: [],
    superOvers: [],
    squads: [],
    completedAt: null,
    ...partial,
  };
}

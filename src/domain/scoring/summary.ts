import type {
  InningsState,
  InningsSummary,
  IsoDateTime,
  MatchResult,
  MatchSetup,
  MatchState,
  MatchSummary,
  PartnershipLine,
  PlayerBattingLine,
  PlayerBowlingLine,
} from '../types';
import { canonicalJson } from './internal/canonical';
import { battingSquad } from './internal/squad';
import { resultWinner } from './result';

export const SCORING_PROJECTION_VERSION = 2;

export interface SummaryMeta {
  readonly completedAt: IsoDateTime | null;
}

function battingLines(innings: InningsState): readonly PlayerBattingLine[] {
  return innings.batting
    .filter((row) => row.position !== null)
    .map((row) => ({
      playerId: row.playerId,
      runs: row.runs,
      balls: row.balls,
      fours: row.fours,
      sixes: row.sixes,
      out: row.status === 'out',
      dismissalType: row.dismissal?.type ?? null,
    }));
}

function bowlingLines(innings: InningsState): readonly PlayerBowlingLine[] {
  return innings.bowling.map((row) => ({
    playerId: row.playerId,
    legalBalls: row.legalBalls,
    maidens: row.maidens,
    runsConceded: row.runsConceded,
    wickets: row.wickets,
    wides: row.wideDeliveries,
    noBalls: row.noBallDeliveries,
  }));
}

function bestPartnership(innings: InningsState): PartnershipLine | null {
  if (innings.balls.length === 0) {
    return null;
  }
  let best: PartnershipLine | null = null;
  for (const partnership of innings.partnerships) {
    if (best === null || partnership.runs > best.runs) {
      best = {
        wicketNumber: partnership.wicketNumber,
        batterAId: partnership.batterAId,
        batterBId: partnership.batterBId,
        runs: partnership.runs,
        balls: partnership.balls,
      };
    }
  }
  return best;
}

function inningsSummary(setup: MatchSetup, innings: InningsState): InningsSummary {
  const reason = innings.completion?.reason ?? null;
  return {
    inningsIndex: innings.index,
    battingTeamId: innings.battingTeamId,
    bowlingTeamId: innings.bowlingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    allottedBalls: innings.limits.maxBalls,
    ballsPerOver: setup.rules.ballsPerOver,
    allOut: reason === 'all_out' || reason === 'batters_unavailable',
    completion: reason,
    target: innings.target?.runs ?? null,
    targetRevised: innings.target?.revised ?? false,
    extras: innings.extras.total,
    fours: innings.balls.filter((ball) => ball.isFour).length,
    sixes: innings.balls.filter((ball) => ball.isSix).length,
    batting: battingLines(innings),
    bowling: bowlingLines(innings),
    bestPartnership: bestPartnership(innings),
  };
}

export function buildMatchSummary(setup: MatchSetup, state: MatchState, meta: SummaryMeta): MatchSummary | null {
  const result = state.result;
  if (result === null || (state.lifecycle !== 'completed' && state.lifecycle !== 'abandoned')) {
    return null;
  }
  return {
    summaryVersion: 2,
    matchId: setup.matchId,
    teamAId: setup.teams[0].id,
    teamBId: setup.teams[1].id,
    status: state.lifecycle,
    result,
    winnerTeamId: resultWinner(result),
    ballsPerOver: setup.rules.ballsPerOver,
    innings: state.innings.filter((innings) => innings.kind === 'regular').map((innings) => inningsSummary(setup, innings)),
    superOvers: state.innings.filter((innings) => innings.kind === 'super_over').map((innings) => inningsSummary(setup, innings)),
    squads: setup.teams.map((team) => ({ teamId: team.id, playerIds: battingSquad(setup, team.id).map((player) => player.playerId) })),
    completedAt: meta.completedAt,
  };
}

function resultKey(result: MatchResult): string {
  return canonicalJson(result);
}

function inningsKey(innings: InningsSummary): string {
  return canonicalJson([
    innings.inningsIndex,
    innings.battingTeamId,
    innings.bowlingTeamId,
    innings.runs,
    innings.legalBalls,
    innings.wickets,
    innings.allottedBalls,
    innings.ballsPerOver,
    innings.allOut,
    innings.completion,
    innings.target,
    innings.targetRevised,
  ]);
}

export function summariesAffectStandingsEqually(a: MatchSummary | null, b: MatchSummary | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (
    a.matchId !== b.matchId ||
    a.teamAId !== b.teamAId ||
    a.teamBId !== b.teamBId ||
    a.status !== b.status ||
    a.winnerTeamId !== b.winnerTeamId ||
    a.ballsPerOver !== b.ballsPerOver ||
    resultKey(a.result) !== resultKey(b.result) ||
    a.innings.length !== b.innings.length
  ) {
    return false;
  }
  return a.innings.every((innings, index) => inningsKey(innings) === inningsKey(b.innings[index]));
}

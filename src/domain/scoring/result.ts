import type {
  BallCount,
  InningsState,
  MatchResult,
  MatchSetup,
  MatchState,
  MatchStatus,
  MatchTeam,
  Runs,
  TeamId,
} from '../types';
import { boundaryCounts } from './stats';

function mainMatchResult(first: InningsState, chase: InningsState): MatchResult | null {
  if (chase.status !== 'complete' || chase.target === null) {
    return null;
  }
  if (chase.completion?.reason === 'match_ended') {
    return null;
  }
  const target = chase.target.runs;
  const par = target - 1;
  const runs = chase.runs;
  const chasing = chase.battingTeamId;
  const defending = first.battingTeamId;
  if (chase.completion?.reason === 'terminated') {
    if (runs > par) {
      return { type: 'win', winnerTeamId: chasing, loserTeamId: defending, margin: { kind: 'runs', runs: runs - par }, method: 'par_score' };
    }
    if (runs < par) {
      return { type: 'win', winnerTeamId: defending, loserTeamId: chasing, margin: { kind: 'runs', runs: par - runs }, method: 'par_score' };
    }
    return { type: 'tie', decider: null };
  }
  const method = chase.target.revised ? 'revised_target' : 'normal';
  const allOut = chase.completion?.reason === 'all_out' || chase.completion?.reason === 'batters_unavailable';
  if (runs >= target && allOut) {
    return { type: 'win', winnerTeamId: chasing, loserTeamId: defending, margin: { kind: 'runs', runs: runs - par }, method: 'penalty_runs' };
  }
  if (runs >= target) {
    return {
      type: 'win',
      winnerTeamId: chasing,
      loserTeamId: defending,
      margin: {
        kind: 'wickets',
        wickets: Math.max(0, chase.limits.maxWickets - chase.wickets),
        ballsRemaining: Math.max(0, chase.limits.maxBalls - chase.legalBalls),
      },
      method,
    };
  }
  if (runs === par) {
    return { type: 'tie', decider: null };
  }
  return { type: 'win', winnerTeamId: defending, loserTeamId: chasing, margin: { kind: 'runs', runs: par - runs }, method };
}

function superOverResult(setup: MatchSetup, state: MatchState, round: number): MatchResult | null {
  const first = state.innings[2 * round];
  const second = state.innings[2 * round + 1];
  if (first === undefined || second === undefined || first.status !== 'complete' || second.status !== 'complete') {
    return null;
  }
  if (first.completion?.reason === 'match_ended' || second.completion?.reason === 'match_ended') {
    return null;
  }
  if (first.runs !== second.runs) {
    const winnerTeamId = first.runs > second.runs ? first.battingTeamId : second.battingTeamId;
    return { type: 'tie', decider: { method: 'super_over', winnerTeamId, superOverRounds: round } };
  }
  if (setup.rules.superOver.ifTiedAgain === 'boundary_count') {
    const counts = boundaryCounts(state);
    const a = counts.find((entry) => entry.teamId === setup.teams[0].id);
    const b = counts.find((entry) => entry.teamId === setup.teams[1].id);
    const totalA = a === undefined ? 0 : a.fours + a.sixes;
    const totalB = b === undefined ? 0 : b.fours + b.sixes;
    if (totalA !== totalB) {
      const winnerTeamId = totalA > totalB ? setup.teams[0].id : setup.teams[1].id;
      return { type: 'tie', decider: { method: 'boundary_count', winnerTeamId, superOverRounds: round } };
    }
  }
  return { type: 'tie', decider: null };
}

export function computeNaturalResult(setup: MatchSetup, state: MatchState): MatchResult | null {
  if (state.superOverRound !== null) {
    return superOverResult(setup, state, state.superOverRound);
  }
  const first = state.innings[0];
  const chase = state.innings[1];
  if (first === undefined || chase === undefined) {
    return null;
  }
  return mainMatchResult(first, chase);
}

export function resultWinner(result: MatchResult): TeamId | null {
  switch (result.type) {
    case 'win':
      return result.winnerTeamId;
    case 'tie':
      return result.decider?.winnerTeamId ?? null;
    case 'walkover':
      return result.winnerTeamId;
    case 'awarded':
      return result.winnerTeamId;
    case 'no_result':
    case 'abandoned':
      return null;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export function resultLoser(result: MatchResult, teamIds: readonly [TeamId, TeamId]): TeamId | null {
  switch (result.type) {
    case 'win':
      return result.loserTeamId;
    case 'walkover':
      return result.loserTeamId;
    case 'awarded':
      return result.loserTeamId;
    case 'tie': {
      const winner = result.decider?.winnerTeamId ?? null;
      if (winner === null) {
        return null;
      }
      return winner === teamIds[0] ? teamIds[1] : teamIds[0];
    }
    case 'no_result':
    case 'abandoned':
      return null;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export type ResultMethod =
  | 'normal'
  | 'revised_target'
  | 'par_score'
  | 'penalty_runs'
  | 'super_over'
  | 'boundary_count'
  | 'bowl_out'
  | 'coin_toss'
  | 'organizer'
  | 'walkover'
  | 'awarded'
  | 'none';

export function resultMethod(result: MatchResult): ResultMethod {
  switch (result.type) {
    case 'win':
      return result.method;
    case 'tie':
      return result.decider?.method ?? 'none';
    case 'walkover':
      return 'walkover';
    case 'awarded':
      return 'awarded';
    case 'no_result':
    case 'abandoned':
      return 'none';
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

function nameOf(teams: readonly MatchTeam[], teamId: TeamId | null): string {
  if (teamId === null) {
    return 'Unknown team';
  }
  return teams.find((team) => team.id === teamId)?.name ?? 'Unknown team';
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

const METHOD_SUFFIX: Readonly<Record<'normal' | 'revised_target' | 'par_score', string>> = {
  normal: '',
  revised_target: ' (revised target)',
  par_score: ' (par score)',
};

export function formatResult(result: MatchResult, teams: readonly MatchTeam[]): string {
  switch (result.type) {
    case 'win': {
      const winner = nameOf(teams, result.winnerTeamId);
      if (result.method === 'penalty_runs') {
        return `${winner} won by penalty runs`;
      }
      const suffix = METHOD_SUFFIX[result.method];
      if (result.margin.kind === 'runs') {
        return `${winner} won by ${plural(result.margin.runs, 'run', 'runs')}${suffix}`;
      }
      const balls = result.margin.ballsRemaining > 0 ? ` (${plural(result.margin.ballsRemaining, 'ball', 'balls')} left)` : '';
      return `${winner} won by ${plural(result.margin.wickets, 'wicket', 'wickets')}${balls}${suffix}`;
    }
    case 'tie': {
      if (result.decider === null) {
        return 'Match tied';
      }
      const winner = nameOf(teams, result.decider.winnerTeamId);
      switch (result.decider.method) {
        case 'super_over':
          return `Match tied — ${winner} won the Super Over`;
        case 'boundary_count':
          return `Match tied — ${winner} won on boundary count`;
        case 'bowl_out':
          return `Match tied — ${winner} won the bowl-out`;
        case 'coin_toss':
          return `Match tied — ${winner} won the coin toss`;
        case 'organizer':
          return `Match tied — ${winner} won by organizer decision`;
        default: {
          const unreachable: never = result.decider.method;
          return unreachable;
        }
      }
    }
    case 'no_result':
      return 'No result';
    case 'abandoned':
      return 'Match abandoned';
    case 'walkover':
      return `${nameOf(teams, result.winnerTeamId)} won by walkover`;
    case 'awarded':
      return result.winnerTeamId === null ? 'No result (awarded)' : `Match awarded to ${nameOf(teams, result.winnerTeamId)}`;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

export function matchStatusLabel(status: MatchStatus, result: MatchResult | null): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'live':
      return 'Live';
    case 'paused':
      return 'Paused';
    case 'postponed':
      return 'Postponed';
    case 'cancelled':
      return 'Cancelled';
    case 'abandoned':
      return 'Abandoned';
    case 'completed':
      if (result === null) {
        return 'Completed';
      }
      switch (result.type) {
        case 'tie':
          return 'Tied';
        case 'no_result':
          return 'No Result';
        case 'walkover':
          return 'Walkover';
        case 'abandoned':
          return 'Abandoned';
        case 'win':
        case 'awarded':
          return 'Completed';
        default: {
          const unreachable: never = result;
          return unreachable;
        }
      }
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function suggestRevisedTarget(
  method: 'average_run_rate',
  firstInningsRuns: Runs,
  firstInningsBalls: BallCount,
  chaseBalls: BallCount,
): Runs | null {
  switch (method) {
    case 'average_run_rate':
      if (firstInningsBalls <= 0) {
        return null;
      }
      return Math.floor((firstInningsRuns * chaseBalls) / firstInningsBalls) + 1;
    default: {
      const unreachable: never = method;
      return unreachable;
    }
  }
}

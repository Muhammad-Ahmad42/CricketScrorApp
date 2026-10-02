import type {
  InningsCompletionReason,
  InningsSummary,
  MatchResult,
  MatchSummary,
  PartnershipLine,
  PlayerBattingLine,
  PlayerBowlingLine,
  TeamId,
  TieDecider,
} from '@/domain/types';

export interface InningsSpec {
  readonly team: TeamId;
  readonly runs: number;
  readonly balls: number;
  readonly wickets?: number;
  readonly allOut?: boolean;
  readonly allotted?: number;
  readonly bpo?: number;
  readonly target?: number | null;
  readonly targetRevised?: boolean;
  readonly completion?: InningsCompletionReason | null;
  readonly fours?: number;
  readonly sixes?: number;
  readonly batting?: readonly PlayerBattingLine[];
  readonly bowling?: readonly PlayerBowlingLine[];
  readonly bestPartnership?: PartnershipLine | null;
}

export function inningsOf(spec: InningsSpec, opponent: TeamId, index: number): InningsSummary {
  const bpo = spec.bpo ?? 6;
  const allotted = spec.allotted ?? 20 * bpo;
  const allOut = spec.allOut ?? false;
  return {
    inningsIndex: index,
    battingTeamId: spec.team,
    bowlingTeamId: opponent,
    runs: spec.runs,
    wickets: spec.wickets ?? (allOut ? 10 : 0),
    legalBalls: spec.balls,
    allottedBalls: allotted,
    ballsPerOver: bpo,
    allOut,
    completion: spec.completion !== undefined ? spec.completion : allOut ? 'all_out' : 'overs_complete',
    target: spec.target !== undefined ? spec.target : null,
    targetRevised: spec.targetRevised ?? false,
    extras: 0,
    fours: spec.fours ?? 0,
    sixes: spec.sixes ?? 0,
    batting: spec.batting ?? [],
    bowling: spec.bowling ?? [],
    bestPartnership: spec.bestPartnership ?? null,
  };
}

export interface SummarySpec {
  readonly matchId: string;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly result: MatchResult;
  readonly innings?: readonly InningsSummary[];
  readonly superOvers?: readonly InningsSummary[];
  readonly bpo?: number;
  readonly squads?: MatchSummary['squads'];
  readonly completedAt?: string | null;
}

export function summaryOf(spec: SummarySpec): MatchSummary {
  const winner = winnerOf(spec.result);
  return {
    summaryVersion: 2,
    matchId: spec.matchId,
    teamAId: spec.teamAId,
    teamBId: spec.teamBId,
    status: spec.result.type === 'abandoned' ? 'abandoned' : 'completed',
    result: spec.result,
    winnerTeamId: winner,
    ballsPerOver: spec.bpo ?? 6,
    innings: spec.innings ?? [],
    superOvers: spec.superOvers ?? [],
    squads: spec.squads ?? [],
    completedAt: spec.completedAt ?? null,
  };
}

function winnerOf(result: MatchResult): TeamId | null {
  switch (result.type) {
    case 'win':
    case 'walkover':
      return result.winnerTeamId;
    case 'awarded':
      return result.winnerTeamId;
    case 'tie':
      return result.decider?.winnerTeamId ?? null;
    default:
      return null;
  }
}

export interface PlayedOptions {
  readonly allotted?: number;
  readonly bpo?: number;
  readonly decider?: TieDecider | null;
  readonly completedAt?: string | null;
  readonly method?: 'normal' | 'revised_target' | 'par_score';
  readonly squads?: MatchSummary['squads'];
  readonly superOvers?: readonly InningsSummary[];
}

export function played(matchId: string, first: InningsSpec, second: InningsSpec, opts: PlayedOptions = {}): MatchSummary {
  const bpo = opts.bpo ?? first.bpo ?? 6;
  const allotted = opts.allotted ?? first.allotted ?? 20 * bpo;
  const i0 = inningsOf({ ...first, bpo, allotted: first.allotted ?? allotted }, second.team, 0);
  const chaseCompletion: InningsCompletionReason =
    second.runs > first.runs ? 'target_reached' : second.allOut ? 'all_out' : 'overs_complete';
  const i1 = inningsOf(
    {
      ...second,
      bpo,
      allotted: second.allotted ?? allotted,
      target: second.target !== undefined ? second.target : first.runs + 1,
      completion: second.completion !== undefined ? second.completion : chaseCompletion,
    },
    first.team,
    1,
  );
  const target = i1.target ?? first.runs + 1;
  let result: MatchResult;
  if (i1.runs >= target) {
    result = {
      type: 'win',
      winnerTeamId: second.team,
      loserTeamId: first.team,
      margin: { kind: 'wickets', wickets: 10 - i1.wickets, ballsRemaining: i1.allottedBalls - i1.legalBalls },
      method: opts.method ?? 'normal',
    };
  } else if (i1.runs === target - 1) {
    result = { type: 'tie', decider: opts.decider ?? null };
  } else {
    result = {
      type: 'win',
      winnerTeamId: first.team,
      loserTeamId: second.team,
      margin: { kind: 'runs', runs: target - 1 - i1.runs },
      method: opts.method ?? 'normal',
    };
  }
  return summaryOf({
    matchId,
    teamAId: first.team,
    teamBId: second.team,
    result,
    innings: [i0, i1],
    bpo,
    completedAt: opts.completedAt ?? null,
    squads: opts.squads,
    superOvers: opts.superOvers,
  });
}

export function simpleWin(matchId: string, winner: TeamId, loser: TeamId, opts: PlayedOptions = {}): MatchSummary {
  return played(matchId, { team: winner, runs: 150, balls: 120, wickets: 5 }, { team: loser, runs: 140, balls: 120, wickets: 8 }, opts);
}

export function outcomeSummary(
  matchId: string,
  teamAId: TeamId,
  teamBId: TeamId,
  result: MatchResult,
  innings: readonly InningsSummary[] = [],
): MatchSummary {
  return summaryOf({ matchId, teamAId, teamBId, result, innings });
}

export function noResult(matchId: string, a: TeamId, b: TeamId, innings: readonly InningsSummary[] = []): MatchSummary {
  return outcomeSummary(matchId, a, b, { type: 'no_result', reason: 'Rain' }, innings);
}

export function abandoned(matchId: string, a: TeamId, b: TeamId, innings: readonly InningsSummary[] = []): MatchSummary {
  return outcomeSummary(matchId, a, b, { type: 'abandoned', reason: 'Rain' }, innings);
}

export function walkover(matchId: string, winner: TeamId, loser: TeamId): MatchSummary {
  return outcomeSummary(matchId, winner, loser, { type: 'walkover', winnerTeamId: winner, loserTeamId: loser, reason: null });
}

export function tieSummary(matchId: string, a: TeamId, b: TeamId, deciderWinner: TeamId | null = null): MatchSummary {
  return played(
    matchId,
    { team: a, runs: 150, balls: 120, wickets: 7 },
    { team: b, runs: 150, balls: 120, wickets: 9 },
    { decider: deciderWinner ? { method: 'super_over', winnerTeamId: deciderWinner, superOverRounds: 1 } : null },
  );
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

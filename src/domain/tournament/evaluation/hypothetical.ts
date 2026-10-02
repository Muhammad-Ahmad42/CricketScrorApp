import type {
  Fixture,
  HypotheticalResult,
  HypotheticalScore,
  InningsSummary,
  MatchRules,
  MatchResult,
  MatchSummary,
  TeamId,
  TournamentSnapshot,
  WinMargin,
} from '../../types';

type Sides = { readonly a: TeamId; readonly b: TeamId };
type InningsFigures = HypotheticalScore['firstInnings'];

function innings(index: number, batting: TeamId, bowling: TeamId, figures: InningsFigures, target: number | null, allotted: number, bpo: number): InningsSummary {
  const reached = target !== null && figures.runs >= target;
  return {
    inningsIndex: index,
    battingTeamId: batting,
    bowlingTeamId: bowling,
    runs: figures.runs,
    wickets: figures.allOut ? 10 : 0,
    legalBalls: figures.balls,
    allottedBalls: allotted,
    ballsPerOver: bpo,
    allOut: figures.allOut,
    completion: reached ? 'target_reached' : figures.allOut ? 'all_out' : 'overs_complete',
    target,
    targetRevised: false,
    extras: 0,
    fours: 0,
    sixes: 0,
    batting: [],
    bowling: [],
    bestPartnership: null,
  };
}

export function scoreInnings(score: HypotheticalScore, sides: Sides, allotted: number, bpo: number): readonly InningsSummary[] {
  const first = score.battingFirst === 'side_a' ? sides.a : sides.b;
  const second = first === sides.a ? sides.b : sides.a;
  return [
    innings(0, first, second, score.firstInnings, null, allotted, bpo),
    innings(1, second, first, score.secondInnings, score.firstInnings.runs + 1, allotted, bpo),
  ];
}

function margin(winner: TeamId, score: HypotheticalScore | null, sides: Sides, allotted: number): WinMargin {
  if (!score) return { kind: 'runs', runs: 0 };
  const firstTeam = score.battingFirst === 'side_a' ? sides.a : sides.b;
  if (winner === firstTeam) return { kind: 'runs', runs: Math.max(0, score.firstInnings.runs - score.secondInnings.runs) };
  return { kind: 'wickets', wickets: score.secondInnings.allOut ? 0 : 1, ballsRemaining: Math.max(0, allotted - score.secondInnings.balls) };
}

function resultOf(hypothetical: HypotheticalResult, sides: Sides, allotted: number): MatchResult {
  switch (hypothetical.outcome) {
    case 'side_a_win':
    case 'side_b_win': {
      const winner = hypothetical.outcome === 'side_a_win' ? sides.a : sides.b;
      const loser = winner === sides.a ? sides.b : sides.a;
      return { type: 'win', winnerTeamId: winner, loserTeamId: loser, margin: margin(winner, hypothetical.score, sides, allotted), method: 'normal' };
    }
    case 'tie': {
      const tieWinner = hypothetical.tieWinner ?? null;
      if (tieWinner === null) return { type: 'tie', decider: null };
      return { type: 'tie', decider: { method: 'super_over', winnerTeamId: tieWinner === 'side_a' ? sides.a : sides.b, superOverRounds: 1 } };
    }
    case 'no_result':
      return { type: 'no_result', reason: null };
    case 'abandoned':
      return { type: 'abandoned', reason: null };
    case 'side_a_walkover':
      return { type: 'walkover', winnerTeamId: sides.a, loserTeamId: sides.b, reason: null };
    case 'side_b_walkover':
      return { type: 'walkover', winnerTeamId: sides.b, loserTeamId: sides.a, reason: null };
    default: {
      const never: never = hypothetical.outcome;
      return never;
    }
  }
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
    case 'no_result':
    case 'abandoned':
      return null;
    default: {
      const never: never = result;
      return never;
    }
  }
}

export function buildHypotheticalSummary(
  fixture: Fixture,
  sides: Sides,
  hypothetical: HypotheticalResult,
  allottedBalls: number,
  ballsPerOver: number,
): MatchSummary {
  const result = resultOf(hypothetical, sides, allottedBalls);
  const played = result.type !== 'walkover' && hypothetical.score !== null;
  return {
    summaryVersion: 2,
    matchId: `whatif:${fixture.id}`,
    teamAId: sides.a,
    teamBId: sides.b,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winnerOf(result),
    ballsPerOver,
    innings: played && hypothetical.score ? scoreInnings(hypothetical.score, sides, allottedBalls, ballsPerOver) : [],
    superOvers: [],
    squads: [],
    completedAt: null,
    hypothetical: { bonus: result.type === 'win' && hypothetical.bonus === true },
  };
}

export function effectiveMatchRules(snapshot: TournamentSnapshot, fixture: Fixture): MatchRules {
  const stage = snapshot.stages.find((candidate) => candidate.id === fixture.stageId);
  return fixture.matchRules ?? stage?.config.matchRules ?? snapshot.rules.defaultMatchRules;
}

export function withSummary(snapshot: TournamentSnapshot, fixtureId: string, summary: MatchSummary): TournamentSnapshot {
  return {
    ...snapshot,
    fixtures: snapshot.fixtures.map((fixture) =>
      fixture.id === fixtureId
        ? {
            ...fixture,
            matchId: summary.matchId,
            matchSides: { teamAId: summary.teamAId, teamBId: summary.teamBId },
            status: summary.status === 'abandoned' ? 'abandoned' : 'completed',
          }
        : fixture,
    ),
    summaries: { ...snapshot.summaries, [summary.matchId]: summary },
  };
}

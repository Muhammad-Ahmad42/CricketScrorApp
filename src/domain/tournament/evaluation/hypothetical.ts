import type {
  Fixture,
  HypotheticalMargin,
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

function winningSide(hypothetical: HypotheticalResult): 'side_a' | 'side_b' | null {
  if (hypothetical.outcome === 'side_a_win') return 'side_a';
  if (hypothetical.outcome === 'side_b_win') return 'side_b';
  return null;
}

function validMargin(hypothetical: HypotheticalResult, allotted: number): HypotheticalMargin | null {
  const given = hypothetical.margin ?? null;
  if (given === null || winningSide(hypothetical) === null) return null;
  if (given.kind === 'runs') return Number.isInteger(given.runs) && given.runs >= 1 ? given : null;
  const wicketsOk = Number.isInteger(given.wickets) && given.wickets >= 1 && given.wickets <= 10;
  const ballsOk = Number.isInteger(given.ballsRemaining) && given.ballsRemaining >= 0 && given.ballsRemaining < allotted;
  return wicketsOk && ballsOk ? given : null;
}

export function scoreFromMargin(hypothetical: HypotheticalResult, allotted: number, parRuns: number): HypotheticalScore | null {
  const winner = winningSide(hypothetical);
  const given = validMargin(hypothetical, allotted);
  if (winner === null || given === null) return null;
  const par = Math.max(1, Math.round(parRuns));
  if (given.kind === 'runs') {
    const first = Math.max(par, given.runs);
    return {
      battingFirst: winner,
      firstInnings: { runs: first, balls: allotted, allOut: false },
      secondInnings: { runs: first - given.runs, balls: allotted, allOut: false },
    };
  }
  return {
    battingFirst: winner === 'side_a' ? 'side_b' : 'side_a',
    firstInnings: { runs: par, balls: allotted, allOut: false },
    secondInnings: { runs: par + 1, balls: allotted - given.ballsRemaining, allOut: false },
  };
}

export function scoreOf(hypothetical: HypotheticalResult, allotted: number, parRuns: number): { readonly score: HypotheticalScore | null; readonly estimated: boolean } {
  if (hypothetical.score !== null) return { score: hypothetical.score, estimated: false };
  const derived = scoreFromMargin(hypothetical, allotted, parRuns);
  return { score: derived, estimated: derived !== null };
}

function margin(winner: TeamId, score: HypotheticalScore | null, sides: Sides, allotted: number): WinMargin {
  if (!score) return { kind: 'runs', runs: 0 };
  const firstTeam = score.battingFirst === 'side_a' ? sides.a : sides.b;
  if (winner === firstTeam) return { kind: 'runs', runs: Math.max(0, score.firstInnings.runs - score.secondInnings.runs) };
  return { kind: 'wickets', wickets: score.secondInnings.allOut ? 0 : 1, ballsRemaining: Math.max(0, allotted - score.secondInnings.balls) };
}

function resultOf(hypothetical: HypotheticalResult, score: HypotheticalScore | null, sides: Sides, allotted: number): MatchResult {
  switch (hypothetical.outcome) {
    case 'side_a_win':
    case 'side_b_win': {
      const winner = hypothetical.outcome === 'side_a_win' ? sides.a : sides.b;
      const loser = winner === sides.a ? sides.b : sides.a;
      const given = hypothetical.score === null ? validMargin(hypothetical, allotted) : null;
      return { type: 'win', winnerTeamId: winner, loserTeamId: loser, margin: given ?? margin(winner, score, sides, allotted), method: 'normal' };
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
  parRuns: number = allottedBalls,
): MatchSummary {
  const { score } = scoreOf(hypothetical, allottedBalls, parRuns);
  const result = resultOf(hypothetical, score, sides, allottedBalls);
  const played = result.type !== 'walkover' && score !== null;
  return {
    summaryVersion: 2,
    matchId: `whatif:${fixture.id}`,
    teamAId: sides.a,
    teamBId: sides.b,
    status: result.type === 'abandoned' ? 'abandoned' : 'completed',
    result,
    winnerTeamId: winnerOf(result),
    ballsPerOver,
    innings: played && score ? scoreInnings(score, sides, allottedBalls, ballsPerOver) : [],
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

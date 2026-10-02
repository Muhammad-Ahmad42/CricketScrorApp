import type { BallCount, InningsSummary, MatchSummary, NrrConfig, Runs, TeamId } from '../../types';
import type { TeamNrrAggregate } from '../nrr';

export interface NrrFigure {
  readonly battingTeamId: TeamId;
  readonly bowlingTeamId: TeamId;
  readonly runs: Runs;
  readonly balls: BallCount;
  readonly ballsPerOver: number;
}

type InningsFilter = 'all' | 'with_balls' | 'completed';

function includeInnings(innings: InningsSummary, filter: InningsFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'with_balls':
      return innings.legalBalls >= 1;
    case 'completed':
      return innings.completion !== null && innings.completion !== 'match_ended';
    default: {
      const never: never = filter;
      return never;
    }
  }
}

function creditsPar(chase: InningsSummary | undefined, config: NrrConfig): chase is InningsSummary {
  if (!chase || config.revisedTarget !== 'icc_par' || chase.target === null) return false;
  return chase.targetRevised || chase.completion === 'terminated';
}

function inningsBalls(innings: InningsSummary, config: NrrConfig): BallCount {
  return config.mode === 'icc' && innings.allOut ? innings.allottedBalls : innings.legalBalls;
}

function regularFigures(summary: MatchSummary, config: NrrConfig, filter: InningsFilter): readonly NrrFigure[] {
  const [first, chase] = summary.innings;
  const par = creditsPar(chase, config);
  const figures: NrrFigure[] = [];
  summary.innings.forEach((innings, index) => {
    if (index > 1 || !includeInnings(innings, filter)) return;
    if (index === 0 && par && chase && first) {
      figures.push({
        battingTeamId: innings.battingTeamId,
        bowlingTeamId: innings.bowlingTeamId,
        runs: (chase.target ?? 1) - 1,
        balls: chase.allottedBalls,
        ballsPerOver: chase.ballsPerOver,
      });
      return;
    }
    figures.push({
      battingTeamId: innings.battingTeamId,
      bowlingTeamId: innings.bowlingTeamId,
      runs: innings.runs,
      balls: inningsBalls(innings, config),
      ballsPerOver: innings.ballsPerOver,
    });
  });
  return figures;
}

function walkoverFigures(summary: MatchSummary, config: NrrConfig): readonly NrrFigure[] | null {
  if (summary.result.type !== 'walkover' || config.walkover.kind !== 'notional') return null;
  const { winnerTeamId, loserTeamId } = summary.result;
  const policy = config.walkover;
  return [
    {
      battingTeamId: winnerTeamId,
      bowlingTeamId: loserTeamId,
      runs: policy.winnerRuns,
      balls: policy.winnerBalls,
      ballsPerOver: summary.ballsPerOver,
    },
    {
      battingTeamId: loserTeamId,
      bowlingTeamId: winnerTeamId,
      runs: policy.loserRuns,
      balls: policy.loserBalls,
      ballsPerOver: summary.ballsPerOver,
    },
  ];
}

export function matchNrrFigures(
  summary: MatchSummary,
  config: NrrConfig,
  expungedTeamIds?: ReadonlySet<TeamId>,
): readonly NrrFigure[] | null {
  if (expungedTeamIds && (expungedTeamIds.has(summary.teamAId) || expungedTeamIds.has(summary.teamBId))) return null;
  const figures = figuresForResult(summary, config);
  return figures && figures.length > 0 ? figures : null;
}

function figuresForResult(summary: MatchSummary, config: NrrConfig): readonly NrrFigure[] | null {
  const result = summary.result;
  switch (result.type) {
    case 'win':
    case 'tie':
      return regularFigures(summary, config, 'all');
    case 'no_result':
      return config.includeNoResult ? regularFigures(summary, config, 'with_balls') : null;
    case 'abandoned':
      return config.includeAbandoned ? regularFigures(summary, config, 'with_balls') : null;
    case 'walkover':
      return walkoverFigures(summary, config);
    case 'awarded':
      return config.awarded === 'use_played_innings' ? regularFigures(summary, config, 'completed') : null;
    default: {
      const never: never = result;
      return never;
    }
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcmOf(values: Iterable<number>): number {
  let result = 1;
  for (const value of values) {
    if (value > 0) result = (result / gcd(result, value)) * value;
  }
  return result;
}

export interface BallTotals {
  readonly runs: Runs;
  readonly balls: BallCount;
  readonly ballsByOverLength: ReadonlyMap<number, BallCount>;
}

export const EMPTY_TOTALS: BallTotals = { runs: 0, balls: 0, ballsByOverLength: new Map() };

export function addFigure(totals: BallTotals, runs: Runs, balls: BallCount, ballsPerOver: number): BallTotals {
  const byLength = new Map(totals.ballsByOverLength);
  byLength.set(ballsPerOver, (byLength.get(ballsPerOver) ?? 0) + balls);
  return { runs: totals.runs + runs, balls: totals.balls + balls, ballsByOverLength: byLength };
}

export function oversOf(totals: BallTotals): number {
  const denominator = lcmOf(totals.ballsByOverLength.keys());
  let units = 0;
  totals.ballsByOverLength.forEach((balls, ballsPerOver) => {
    units += balls * (denominator / ballsPerOver);
  });
  return units / denominator;
}

export function netRunRate(forTotals: BallTotals, againstTotals: BallTotals): number | null {
  const denominator = lcmOf([...forTotals.ballsByOverLength.keys(), ...againstTotals.ballsByOverLength.keys()]);
  const unitsFor = unitsOf(forTotals, denominator);
  const unitsAgainst = unitsOf(againstTotals, denominator);
  if (unitsFor === 0 || unitsAgainst === 0) return null;
  return (forTotals.runs * denominator) / unitsFor - (againstTotals.runs * denominator) / unitsAgainst;
}

function unitsOf(totals: BallTotals, denominator: number): number {
  let units = 0;
  totals.ballsByOverLength.forEach((balls, ballsPerOver) => {
    units += balls * (denominator / ballsPerOver);
  });
  return units;
}

class Accumulator {
  runs = 0;
  balls = 0;
  readonly byLength = new Map<number, number>();

  add(runs: Runs, balls: BallCount, ballsPerOver: number): void {
    this.runs += runs;
    this.balls += balls;
    this.byLength.set(ballsPerOver, (this.byLength.get(ballsPerOver) ?? 0) + balls);
  }

  totals(): BallTotals {
    return { runs: this.runs, balls: this.balls, ballsByOverLength: this.byLength };
  }
}

export function aggregateFigureSets(teamId: TeamId, sets: readonly (readonly NrrFigure[])[]): TeamNrrAggregate {
  const scored = new Accumulator();
  const conceded = new Accumulator();
  let matchesCounted = 0;
  for (const figures of sets) {
    let involved = false;
    for (const figure of figures) {
      if (figure.battingTeamId === teamId) {
        scored.add(figure.runs, figure.balls, figure.ballsPerOver);
        involved = true;
      }
      if (figure.bowlingTeamId === teamId) {
        conceded.add(figure.runs, figure.balls, figure.ballsPerOver);
        involved = true;
      }
    }
    if (involved) matchesCounted += 1;
  }
  const forTotals = scored.totals();
  const againstTotals = conceded.totals();
  return {
    teamId,
    runsFor: forTotals.runs,
    ballsFor: forTotals.balls,
    oversFor: oversOf(forTotals),
    runsAgainst: againstTotals.runs,
    ballsAgainst: againstTotals.balls,
    oversAgainst: oversOf(againstTotals),
    matchesCounted,
    nrr: netRunRate(forTotals, againstTotals),
  };
}

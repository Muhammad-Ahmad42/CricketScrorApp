import { NRR_EPSILON } from '../types';
import type { BallCount, MatchSummary, NrrConfig, Runs, TeamId } from '../types';
import { addFigure, aggregateFigureSets, EMPTY_TOTALS, matchNrrFigures, oversOf } from './evaluation/nrrFigures';
import type { BallTotals, NrrFigure } from './evaluation/nrrFigures';

export interface NrrContribution {
  readonly teamId: TeamId;
  readonly runsFor: Runs;
  readonly ballsFor: BallCount;
  readonly oversFor: number;
  readonly runsAgainst: Runs;
  readonly ballsAgainst: BallCount;
  readonly oversAgainst: number;
}

interface TeamTotals {
  readonly forTotals: BallTotals;
  readonly againstTotals: BallTotals;
}

function totalsFor(teamId: TeamId, figures: readonly NrrFigure[]): TeamTotals {
  let forTotals = EMPTY_TOTALS;
  let againstTotals = EMPTY_TOTALS;
  for (const figure of figures) {
    if (figure.battingTeamId === teamId) forTotals = addFigure(forTotals, figure.runs, figure.balls, figure.ballsPerOver);
    if (figure.bowlingTeamId === teamId) againstTotals = addFigure(againstTotals, figure.runs, figure.balls, figure.ballsPerOver);
  }
  return { forTotals, againstTotals };
}

function contribution(teamId: TeamId, totals: TeamTotals): NrrContribution {
  return {
    teamId,
    runsFor: totals.forTotals.runs,
    ballsFor: totals.forTotals.balls,
    oversFor: oversOf(totals.forTotals),
    runsAgainst: totals.againstTotals.runs,
    ballsAgainst: totals.againstTotals.balls,
    oversAgainst: oversOf(totals.againstTotals),
  };
}

export function matchNrrContributions(
  summary: MatchSummary,
  config: NrrConfig,
  expungedTeamIds?: ReadonlySet<TeamId>,
): readonly [NrrContribution, NrrContribution] | null {
  const figures = matchNrrFigures(summary, config, expungedTeamIds);
  if (!figures) return null;
  return [
    contribution(summary.teamAId, totalsFor(summary.teamAId, figures)),
    contribution(summary.teamBId, totalsFor(summary.teamBId, figures)),
  ];
}

export interface TeamNrrAggregate {
  readonly teamId: TeamId;
  readonly runsFor: Runs;
  readonly ballsFor: BallCount;
  readonly oversFor: number;
  readonly runsAgainst: Runs;
  readonly ballsAgainst: BallCount;
  readonly oversAgainst: number;
  readonly matchesCounted: number;
  readonly nrr: number | null;
}

export function aggregateNrr(
  summaries: readonly MatchSummary[],
  teamIds: readonly TeamId[],
  config: NrrConfig,
  opts?: { readonly restrictToTeams?: boolean; readonly expungedTeamIds?: ReadonlySet<TeamId> },
): ReadonlyMap<TeamId, TeamNrrAggregate> {
  const listed = new Set(teamIds);
  const sets = new Map<TeamId, (readonly NrrFigure[])[]>(teamIds.map((teamId) => [teamId, []]));
  for (const summary of summaries) {
    if (opts?.restrictToTeams && !(listed.has(summary.teamAId) && listed.has(summary.teamBId))) continue;
    const figures = matchNrrFigures(summary, config, opts?.expungedTeamIds);
    if (!figures) continue;
    for (const teamId of new Set([summary.teamAId, summary.teamBId])) sets.get(teamId)?.push(figures);
  }
  return new Map(teamIds.map((teamId) => [teamId, aggregateFigureSets(teamId, sets.get(teamId) ?? [])]));
}

export function computeNrr(runsFor: Runs, oversFor: number, runsAgainst: Runs, oversAgainst: number): number | null {
  if (oversFor === 0 || oversAgainst === 0) return null;
  return runsFor / oversFor - runsAgainst / oversAgainst;
}

export function compareNrr(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (Math.abs(a - b) < NRR_EPSILON) return 0;
  return a > b ? -1 : 1;
}

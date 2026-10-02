import type { PoolId, StandingsTable, TeamId, TournamentSnapshot } from '../../types';
import type { StandingsInput } from '../standings';
import { outcomeSet } from './outcomes';
import { decisivePrefix, MAX_SCENARIOS } from './scenarioModel';
import type { PairResult, PoolScenarioAnalysis, Working } from './scenarioModel';
import { completeBounds, enumerate, pointBounds, uncertain } from './scenarioSearch';
import { isSettledStatus } from './sides';
import { collectCountedResults, rowKeyMap, sideOutcomeFor } from './tableResults';

export { DEFAULT_ENUMERATION_LIMIT } from './scenarioModel';
export type { PoolScenarioAnalysis, PositionBounds } from './scenarioModel';

type Remaining = ReadonlyMap<TeamId, readonly TeamId[]>;

export type PoolModel =
  | { readonly kind: 'uncertain'; readonly teams: readonly TeamId[]; readonly remaining: Remaining; readonly capacity: number }
  | {
      readonly kind: 'complete' | 'open';
      readonly teams: readonly TeamId[];
      readonly remaining: Remaining;
      readonly work: Working;
      readonly inside: boolean;
      readonly played: readonly number[];
    };

const cache = new WeakMap<TournamentSnapshot, Map<string, PoolScenarioAnalysis>>();

export function analysePool(
  snapshot: TournamentSnapshot,
  stageId: string,
  poolId: PoolId,
  table: StandingsTable,
  input: StandingsInput,
  excluded: readonly TeamId[],
  limit: number,
): PoolScenarioAnalysis {
  const key = `${stageId}|${poolId}|${[...excluded].sort().join(',')}|${limit}`;
  let perSnapshot = cache.get(snapshot);
  if (!perSnapshot) {
    perSnapshot = new Map();
    cache.set(snapshot, perSnapshot);
  }
  const hit = perSnapshot.get(key);
  if (hit) return hit;
  const analysis = computeAnalysis(table, input, new Set(excluded), limit);
  perSnapshot.set(key, analysis);
  return analysis;
}

function countedPairs(input: StandingsInput, position: ReadonlyMap<TeamId, number>): PairResult[] {
  const pairs: PairResult[] = [];
  for (const result of collectCountedResults(input)) {
    if (result.rowA === null || result.rowB === null) continue;
    const i = position.get(result.rowA);
    const j = position.get(result.rowB);
    const outcomeI = sideOutcomeFor(result, result.rowA);
    const outcomeJ = sideOutcomeFor(result, result.rowB);
    if (i === undefined || j === undefined || !outcomeI || !outcomeJ) continue;
    pairs.push({
      i,
      j,
      pointsI: outcomeI.points,
      pointsJ: outcomeJ.points,
      winI: outcomeI.column === 'W' ? 1 : 0,
      winJ: outcomeJ.column === 'W' ? 1 : 0,
    });
  }
  return pairs;
}

export function poolModel(table: StandingsTable, input: StandingsInput, excluded: ReadonlySet<TeamId>): PoolModel {
  const rows = table.rows.filter(
    (row): row is typeof row & { readonly teamId: TeamId } => row.teamId !== null && row.membership === 'active' && !excluded.has(row.teamId),
  );
  const teams = rows.map((row) => row.teamId);
  const position = new Map(teams.map((teamId, i) => [teamId, i]));
  const rowKeys = rowKeyMap(input);
  const openFixtures = input.fixtures.filter((fixture) => !isSettledStatus(fixture.status));
  const remaining = new Map<TeamId, TeamId[]>();
  teams.forEach((teamId) => remaining.set(teamId, []));
  const resolvedOpen: { i: number; j: number }[] = [];
  let unresolvedSide = false;
  for (const fixture of openFixtures) {
    const sides = input.fixtureTeams(fixture);
    const a = sides.a === null ? null : (rowKeys.get(sides.a) ?? sides.a);
    const b = sides.b === null ? null : (rowKeys.get(sides.b) ?? sides.b);
    if (a === null || b === null) unresolvedSide = true;
    const i = a === null ? -1 : (position.get(a) ?? -1);
    const j = b === null ? -1 : (position.get(b) ?? -1);
    if (i >= 0 && b !== null) remaining.get(teams[i])?.push(b);
    if (j >= 0 && a !== null) remaining.get(teams[j])?.push(a);
    if (i >= 0 || j >= 0) resolvedOpen.push({ i, j });
  }
  const complete = input.fixtures.length > 0 && openFixtures.length === 0;
  if (input.fixtures.length === 0 || (!complete && (unresolvedSide || table.rows.some((row) => row.teamId === null)))) {
    const capacity = teams.length + table.rows.filter((row) => row.teamId === null).length;
    return { kind: 'uncertain', teams, remaining, capacity };
  }
  const prefix = decisivePrefix(input.rules.tieBreakers);
  const withColumns = prefix.some((kind) => kind === 'wins' || kind === 'fewer_losses' || kind === 'head_to_head_wins');
  const options = outcomeSet(input.rules.points, withColumns);
  const work: Working = {
    n: teams.length,
    points: rows.map((row) => row.points),
    won: rows.map((row) => row.won),
    lost: rows.map((row) => row.lost),
    seeds: teams.map((teamId) => input.seeds.get(teamId) ?? null),
    pairs: complete ? [] : countedPairs(input, position),
    open: resolvedOpen.map((fixture) => ({ i: fixture.i, j: fixture.j, outcomes: options })),
    chosen: resolvedOpen.map(() => null),
    prefix,
    requireComplete: input.rules.headToHeadRequiresCompleteMiniLeague,
  };
  const played = rows.map((row, i) => row.played + resolvedOpen.filter((fixture) => fixture.i === i || fixture.j === i).length);
  return {
    kind: complete ? 'complete' : 'open',
    teams,
    remaining,
    work,
    inside: resolvedOpen.length === openFixtures.length && resolvedOpen.every((fixture) => fixture.i >= 0 && fixture.j >= 0),
    played,
  };
}

function computeAnalysis(table: StandingsTable, input: StandingsInput, excluded: ReadonlySet<TeamId>, limit: number): PoolScenarioAnalysis {
  const model = poolModel(table, input, excluded);
  if (model.kind === 'uncertain') return uncertain(model.teams, model.remaining, model.capacity);
  const { teams, remaining, work } = model;
  if (model.kind === 'complete') return { exact: true, size: teams.length, teams, bounds: completeBounds(table, teams), remaining };
  const scenarioCount = work.open.reduce((total, fixture) => total * fixture.outcomes.length, 1);
  if (work.open.length > limit || scenarioCount > MAX_SCENARIOS) return pointBounds(work, teams, remaining);
  return enumerate(work, teams, remaining);
}

export function positionLocked(analysis: PoolScenarioAnalysis | null, teamId: TeamId, position: number): boolean {
  if (!analysis || !analysis.exact) return false;
  const bounds = analysis.bounds.get(teamId);
  return !!bounds && bounds.best === position && bounds.worst === position;
}

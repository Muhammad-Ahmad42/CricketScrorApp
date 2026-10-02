import type { Fixture, MatchSummary, NrrConfig, PointsSystem, PoolId, TeamId } from '../../types';
import type { StandingsInput } from '../standings';
import { matchNrrFigures } from './nrrFigures';
import type { NrrFigure } from './nrrFigures';
import { remapSummaryTeams } from './remapSummary';
import { resultOutcome } from './resultPoints';
import type { ResultOutcome, SideOutcome } from './resultPoints';
import { byMatchOrder, countedSummaryOf, isActiveOverride } from './sides';

export interface CountedResult {
  readonly fixture: Fixture;
  readonly summary: MatchSummary;
  readonly originalTeams: { readonly a: TeamId; readonly b: TeamId };
  readonly rowA: TeamId | null;
  readonly rowB: TeamId | null;
  readonly outcome: ResultOutcome;
  readonly figures: readonly NrrFigure[] | null;
}

interface Scored {
  readonly outcome: ResultOutcome;
  readonly figures: readonly NrrFigure[] | null;
}

const scoredCache = new WeakMap<MatchSummary, WeakMap<PointsSystem, WeakMap<NrrConfig, Scored>>>();

function score(summary: MatchSummary, points: PointsSystem, nrr: NrrConfig): Scored {
  const byPoints = scoredCache.get(summary) ?? new WeakMap<PointsSystem, WeakMap<NrrConfig, Scored>>();
  scoredCache.set(summary, byPoints);
  const byNrr = byPoints.get(points) ?? new WeakMap<NrrConfig, Scored>();
  byPoints.set(points, byNrr);
  const hit = byNrr.get(nrr);
  if (hit) return hit;
  const scored = { outcome: resultOutcome(summary, points, nrr), figures: matchNrrFigures(summary, nrr) };
  byNrr.set(nrr, scored);
  return scored;
}

export function rowKeyMap(input: StandingsInput): ReadonlyMap<TeamId, TeamId> {
  const map = new Map<TeamId, TeamId>();
  for (const member of input.members) {
    if (member.teamId === null) continue;
    map.set(member.teamId, member.teamId);
  }
  for (const member of input.members) {
    if (member.teamId === null) continue;
    for (const predecessor of member.inheritsFrom) {
      if (!map.has(predecessor)) map.set(predecessor, member.teamId);
    }
  }
  return map;
}

export function expungedTeams(input: StandingsInput): ReadonlySet<TeamId> {
  const set = new Set<TeamId>();
  for (const override of input.overrides) {
    if (override.kind !== 'expunge_results' || !isActiveOverride(override)) continue;
    if (override.stageId === null || override.stageId === input.stageId) set.add(override.teamId);
  }
  return set;
}

export function collectCountedResults(input: StandingsInput): readonly CountedResult[] {
  const rows = rowKeyMap(input);
  const expunged = expungedTeams(input);
  const crossPool = input.poolId === null;
  const counted: CountedResult[] = [];
  for (const fixture of input.fixtures) {
    const summary = countedSummaryOf(input.summaries, fixture);
    if (!summary) continue;
    const a = summary.teamAId;
    const b = summary.teamBId;
    if (expunged.has(a) || expunged.has(b)) continue;
    const rowA = rows.get(a) ?? null;
    const rowB = rows.get(b) ?? null;
    if (crossPool ? rowA === null && rowB === null : rowA === null || rowB === null) continue;
    if (rowA !== null && rowA === rowB) continue;
    const mapping = new Map<TeamId, TeamId>();
    if (rowA !== null) mapping.set(a, rowA);
    if (rowB !== null) mapping.set(b, rowB);
    const remapped = remapSummaryTeams(summary, mapping);
    const scored = score(remapped, input.rules.points, input.rules.nrr);
    counted.push({ fixture, summary: remapped, originalTeams: { a, b }, rowA, rowB, outcome: scored.outcome, figures: scored.figures });
  }
  return counted.sort((x, y) =>
    byMatchOrder(
      { completedAt: x.summary.completedAt, matchNumber: x.fixture.matchNumber },
      { completedAt: y.summary.completedAt, matchNumber: y.fixture.matchNumber },
    ),
  );
}

export function sideOutcomeFor(result: CountedResult, row: TeamId): SideOutcome | null {
  if (result.rowA === row) return result.outcome.a;
  if (result.rowB === row) return result.outcome.b;
  return null;
}

export function opponentOf(result: CountedResult, row: TeamId): TeamId {
  return result.rowA === row ? result.originalTeams.b : result.originalTeams.a;
}

export function droppedResults(
  input: StandingsInput,
  counted: readonly CountedResult[],
  resolvedRows: readonly TeamId[],
): ReadonlySet<string> {
  const dropped = new Set<string>();
  if (input.normalization !== 'drop_extra_results' || !input.poolOrder || resolvedRows.length === 0) return dropped;
  const resultsOf = (row: TeamId) => counted.filter((result) => result.rowA === row || result.rowB === row);
  const target = Math.min(...resolvedRows.map((row) => resultsOf(row).length));
  for (const row of resolvedRows) {
    const own = resultsOf(row);
    let excess = own.length - target;
    if (excess <= 0) continue;
    const order = poolOrderOf(input.poolOrder, row);
    for (let index = order.length - 1; index >= 0 && excess > 0; index -= 1) {
      const opponent = order[index];
      if (opponent === row) continue;
      const against = own.filter((result) => opponentOf(result, row) === opponent).reverse();
      for (const result of against) {
        if (excess === 0) break;
        dropped.add(droppedKey(row, result.fixture.id));
        excess -= 1;
      }
    }
  }
  return dropped;
}

export function droppedKey(row: TeamId, fixtureId: string): string {
  return `${row}|${fixtureId}`;
}

function poolOrderOf(poolOrder: ReadonlyMap<PoolId, readonly TeamId[]>, row: TeamId): readonly TeamId[] {
  for (const order of poolOrder.values()) {
    if (order.includes(row)) return order;
  }
  return [];
}

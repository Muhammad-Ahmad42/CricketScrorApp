import type { PoolId, StandingsTable, TeamId, TournamentSnapshot } from '../../types';
import type { StandingsInput } from '../standings';
import { jointVerdicts } from './crossScenarios';
import type { CrossPool, CrossVerdict } from './crossScenarios';
import { analysePool, poolModel } from './scenarios';
import { completeBounds } from './scenarioSearch';
import { isPrefixSet } from './slotLayout';
import type { ViewLayout } from './slotLayout';
import { rangeMeets, rangeWithin } from './targetSources';

export interface CertaintyInput {
  readonly snapshot: TournamentSnapshot;
  readonly stageId: string;
  readonly tables: readonly StandingsTable[];
  readonly inputs: ReadonlyMap<PoolId, StandingsInput>;
  readonly fixturesInPools: boolean;
  readonly eliminated: readonly TeamId[];
  readonly layout: ViewLayout;
  readonly limit: number;
}

export interface Verdict {
  readonly state: 'qualified' | 'eliminated' | 'in_contention';
  readonly winsGuarantee: boolean;
}

export type VerdictOf = (teamId: TeamId, poolId: PoolId) => Verdict | null;

function activeTeams(table: StandingsTable): readonly TeamId[] {
  return table.rows.flatMap((row) => (row.teamId !== null && row.membership === 'active' ? [row.teamId] : []));
}

function crossPossible(input: CertaintyInput): boolean {
  const { layout } = input;
  if (input.eliminated.length > 0 || layout.pinnedTeams.size > 0 || layout.pinnedSourceSlots || !input.fixturesInPools) return false;
  if (input.tables.some((table) => activeTeams(table).some((teamId) => layout.foreignTeams.has(teamId)))) return false;
  const overall = layout.overall;
  if (overall && (!overall.raw || overall.count === null || !overall.afterPools || layout.bestOf.size > 0)) return false;
  const poolPositions = new Set([...layout.poolSlots.values()].flatMap((positions) => [...positions]));
  for (const [position, entry] of layout.bestOf) {
    if (entry.normalization !== 'raw' && entry.normalization !== 'per_match_average') return false;
    if (poolPositions.has(position)) return false;
  }
  return true;
}

function fixedRanking(table: StandingsTable, teams: readonly TeamId[]): { readonly best: number[]; readonly worst: number[] } {
  const bounds = completeBounds(table, teams);
  return {
    best: teams.map((teamId) => bounds.get(teamId)?.best ?? 1),
    worst: teams.map((teamId) => bounds.get(teamId)?.worst ?? teams.length),
  };
}

function crossVerdicts(input: CertaintyInput): ReadonlyMap<TeamId, CrossVerdict> | null {
  if (!crossPossible(input)) return null;
  const pools: CrossPool[] = [];
  for (const table of input.tables) {
    const source = table.poolId === null ? undefined : input.inputs.get(table.poolId);
    if (table.poolId === null || !source) return null;
    const model = poolModel(table, source, new Set());
    if (model.kind === 'uncertain' || !model.inside) return null;
    pools.push({
      poolId: table.poolId,
      teams: model.teams,
      work: model.work,
      fixed: model.kind === 'complete' ? fixedRanking(table, model.teams) : null,
      played: model.played,
    });
  }
  if (pools.length === 0) return null;
  return jointVerdicts(pools, input.layout, pools[0].work.prefix, input.limit);
}

function everyPoolRepresented(tables: readonly StandingsTable[], position: number, ranks: ReadonlySet<number>): boolean {
  const pools = tables.filter((table) => activeTeams(table).length >= position).length;
  for (let rank = 1; rank <= pools; rank += 1) {
    if (!ranks.has(rank)) return false;
  }
  return true;
}

function poolVerdict(input: CertaintyInput, teamId: TeamId, poolId: PoolId): Verdict | null {
  const { layout } = input;
  const table = input.tables.find((candidate) => candidate.poolId === poolId);
  const source = input.inputs.get(poolId);
  if (!table || !source) return null;
  const members = activeTeams(table);
  if (members.some((member) => layout.foreignTeams.has(member))) return null;
  const pinned = members.filter((member) => layout.pinnedTeams.has(member));
  const holders = layout.poolSlots.get(poolId) ?? new Set<number>();
  const crossSources = layout.bestOf.size > 0 || layout.overall !== null;
  if ((pinned.length > 0 || crossSources) && !isPrefixSet(holders)) return null;
  const shifted = pinned.length > 0 || members.some((member) => input.eliminated.includes(member));
  const qualifying = new Set(holders);
  const candidates = new Set(holders);
  for (const [position, entry] of layout.bestOf) {
    candidates.add(position);
    if (!shifted && everyPoolRepresented(input.tables, position, entry.ranks)) qualifying.add(position);
  }
  const analysis = analysePool(input.snapshot, input.stageId, poolId, table, source, [...input.eliminated, ...pinned], input.limit);
  const bounds = analysis.bounds.get(teamId);
  if (!bounds) return null;
  if (rangeWithin(bounds.best, bounds.worst, qualifying)) return { state: 'qualified', winsGuarantee: false };
  const canExclude = layout.overall === null && !(shifted && layout.bestOf.size > 0);
  if (canExclude && !rangeMeets(bounds.best, bounds.worst, candidates)) return { state: 'eliminated', winsGuarantee: false };
  const winsGuarantee = bounds.worstWinningAll !== null && rangeWithin(bounds.best, bounds.worstWinningAll, qualifying);
  return { state: 'in_contention', winsGuarantee };
}

export function certaintyOf(input: CertaintyInput): VerdictOf {
  const crossSources = input.layout.bestOf.size > 0 || input.layout.overall !== null;
  const joint = crossSources ? crossVerdicts(input) : null;
  if (joint) {
    return (teamId) => {
      const verdict = joint.get(teamId);
      if (!verdict) return null;
      const state = verdict.qualified ? 'qualified' : verdict.eliminated ? 'eliminated' : 'in_contention';
      return { state, winsGuarantee: state === 'in_contention' && verdict.winsGuarantee };
    };
  }
  const memo = new Map<TeamId, Verdict | null>();
  return (teamId, poolId) => {
    if (!memo.has(teamId)) memo.set(teamId, poolVerdict(input, teamId, poolId));
    return memo.get(teamId) ?? null;
  };
}

import type { ComparisonTable, Fixture, PoolId, Stage, StandingsTable, TeamId, UnevenPoolNormalization } from '../../types';
import { computeStandings, effectiveStageRules } from '../standings';
import type { StandingsInput, StandingsMember } from '../standings';
import { comparisonSpecs, poolBoundaries } from './downstream';
import type { ComparisonSpec } from './downstream';
import { stageMembers } from './members';
import type { SlotLookup } from './members';
import type { SnapshotIndex } from './snapshotIndex';

export interface FixtureTeams {
  readonly a: TeamId | null;
  readonly b: TeamId | null;
  readonly frozen: boolean;
}

export function fixtureTeamsVia(fixture: Fixture, lookup: SlotLookup): FixtureTeams {
  if (fixture.matchSides) return { a: fixture.matchSides.teamAId, b: fixture.matchSides.teamBId, frozen: true };
  const sideTeam = (side: Fixture['sideA']): TeamId | null => (side.kind === 'team' ? side.teamId : (lookup(side.slotId)?.teamId ?? null));
  return { a: sideTeam(fixture.sideA), b: sideTeam(fixture.sideB), frozen: false };
}

export interface StageTables {
  readonly tables: readonly StandingsTable[];
  readonly overall: StandingsTable | null;
  readonly comparisonTables: readonly ComparisonTable[];
  readonly inputs: ReadonlyMap<PoolId, StandingsInput>;
}

function baseInput(index: SnapshotIndex, stage: Stage, lookup: SlotLookup): Omit<StandingsInput, 'poolId' | 'members' | 'fixtures'> {
  return {
    stageId: stage.id,
    fixtureTeams: (fixture) => fixtureTeamsVia(fixture, lookup),
    summaries: index.snapshot.summaries,
    rules: effectiveStageRules(index.snapshot, stage.id),
    overrides: index.snapshot.overrides,
    seeds: index.seeds,
    teamNames: index.teamNames,
  };
}

function eligibleRows(table: StandingsTable) {
  return table.rows.filter((row) => row.teamId !== null && row.membership === 'active');
}

function poolOrderOf(tables: readonly StandingsTable[]): ReadonlyMap<PoolId, readonly TeamId[]> {
  const order = new Map<PoolId, readonly TeamId[]>();
  for (const table of tables) {
    if (table.poolId === null) continue;
    order.set(
      table.poolId,
      table.rows.map((row) => row.teamId).filter((teamId): teamId is TeamId => teamId !== null),
    );
  }
  return order;
}

function levelDetail(detail: string, unresolved: boolean): string {
  const base = detail.replace(' — organizer decision required', '');
  return unresolved ? `${base} — organizer decision required` : base;
}

export function classifyTies(table: StandingsTable, boundaries: ReadonlySet<number>): StandingsTable {
  const unresolved: (readonly TeamId[])[] = [];
  const provisional: (readonly TeamId[])[] = [];
  const unresolvedTeams = new Set<TeamId>();
  for (const group of table.provisionalTies) {
    const first = table.rows.find((row) => row.teamId === group[0]);
    const start = first?.position ?? 1;
    const end = start + group.length - 1;
    const straddles = [...boundaries].some((boundary) => boundary >= start && boundary < end);
    if (table.complete && straddles) {
      unresolved.push(group);
      group.forEach((teamId) => unresolvedTeams.add(teamId));
    } else provisional.push(group);
  }
  const rows = table.rows.map((row) => {
    if (!row.sharedPosition || !row.tieBreak || row.tieBreak.separatedBy !== null || !row.tieBreak.detail.startsWith('Level with')) return row;
    return { ...row, tieBreak: { ...row.tieBreak, detail: levelDetail(row.tieBreak.detail, row.teamId !== null && unresolvedTeams.has(row.teamId)) } };
  });
  return { ...table, rows, unresolvedTies: unresolved, provisionalTies: provisional };
}

function comparisonMembers(spec: ComparisonSpec, tables: readonly StandingsTable[], allMembers: readonly StandingsMember[]): StandingsMember[] {
  if (spec.position === null) return [...allMembers];
  const members: StandingsMember[] = [];
  for (const table of tables) {
    const row = eligibleRows(table)[spec.position - 1];
    if (!row || row.teamId === null) continue;
    const member = allMembers.find((candidate) => candidate.teamId === row.teamId);
    members.push(
      member ?? {
        side: row.side,
        slotLabel: row.slotLabel,
        teamId: row.teamId,
        provisional: row.provisional,
        membership: row.membership,
        inheritsFrom: [],
      },
    );
  }
  return members;
}

function rankBoundaries(ranks: readonly number[]): ReadonlySet<number> {
  const set = new Set<number>();
  for (const rank of ranks) {
    if (rank - 1 >= 1) set.add(rank - 1);
    set.add(rank);
  }
  return set;
}

export function buildComparisonTables(
  index: SnapshotIndex,
  stage: Stage,
  tables: readonly StandingsTable[],
  membersByPool: ReadonlyMap<PoolId, readonly StandingsMember[]>,
  lookup: SlotLookup,
): { readonly overall: StandingsTable | null; readonly comparisonTables: readonly ComparisonTable[] } {
  const allMembers = [...membersByPool.values()].flat();
  const fixtures = index.fixturesByStage.get(stage.id) ?? [];
  const base = baseInput(index, stage, lookup);
  const poolOrder = poolOrderOf(tables);
  const specs = comparisonSpecs(index, stage.id);
  const crossTable = (members: readonly StandingsMember[], normalization: UnevenPoolNormalization) =>
    computeStandings({ ...base, poolId: null, members, fixtures, normalization, poolOrder });
  const overallSpec = specs.find((spec) => spec.key === 'overall:raw');
  const overallRaw = tables.length > 1 ? crossTable(allMembers, 'raw') : null;
  const overall = overallRaw ? classifyTies(overallRaw, rankBoundaries(overallSpec?.ranks ?? [])) : null;
  const comparisonTables = specs.map((spec) => {
    const raw =
      spec.key === 'overall:raw' && overallRaw ? overallRaw : crossTable(comparisonMembers(spec, tables, allMembers), spec.normalization);
    return {
      key: spec.key,
      position: spec.position,
      normalization: spec.normalization,
      table: classifyTies(raw, rankBoundaries(spec.ranks)),
    };
  });
  return { overall, comparisonTables };
}

export interface StageInputs {
  readonly membersByPool: ReadonlyMap<PoolId, readonly StandingsMember[]>;
  readonly inputs: ReadonlyMap<PoolId, StandingsInput>;
}

export function buildStageInputs(index: SnapshotIndex, stage: Stage, lookup: SlotLookup): StageInputs {
  const membersByPool = stageMembers(index, stage, lookup);
  const base = baseInput(index, stage, lookup);
  const inputs = new Map<PoolId, StandingsInput>();
  for (const pool of index.poolsByStage.get(stage.id) ?? []) {
    inputs.set(pool.id, {
      ...base,
      poolId: pool.id,
      members: membersByPool.get(pool.id) ?? [],
      fixtures: index.fixturesByPool.get(pool.id)?.filter((fixture) => fixture.stageId === stage.id) ?? [],
    });
  }
  return { membersByPool, inputs };
}

export function buildStageTables(index: SnapshotIndex, stage: Stage, lookup: SlotLookup): StageTables {
  if (stage.type === 'knockout') return { tables: [], overall: null, comparisonTables: [], inputs: new Map() };
  const { membersByPool, inputs } = buildStageInputs(index, stage, lookup);
  const pools = index.poolsByStage.get(stage.id) ?? [];
  const tables = pools.flatMap((pool) => {
    const input = inputs.get(pool.id);
    return input ? [classifyTies(computeStandings(input), poolBoundaries(index, stage, pool.id, pools.length))] : [];
  });
  const { overall, comparisonTables } = buildComparisonTables(index, stage, tables, membersByPool, lookup);
  return { tables, overall, comparisonTables, inputs };
}

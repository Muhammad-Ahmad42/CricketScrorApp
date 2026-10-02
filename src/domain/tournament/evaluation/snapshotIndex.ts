import type {
  Fixture,
  FixtureId,
  Pool,
  PoolEntry,
  PoolId,
  SlotId,
  Stage,
  StageId,
  StageSlot,
  TeamId,
  TournamentOverride,
  TournamentSnapshot,
  TournamentTeamView,
} from '../../types';
import { isActiveOverride } from './sides';

export interface SnapshotIndex {
  readonly snapshot: TournamentSnapshot;
  readonly stagesOrdered: readonly Stage[];
  readonly stageById: ReadonlyMap<StageId, Stage>;
  readonly poolsByStage: ReadonlyMap<StageId, readonly Pool[]>;
  readonly poolById: ReadonlyMap<PoolId, Pool>;
  readonly entriesByPool: ReadonlyMap<PoolId, readonly PoolEntry[]>;
  readonly slotsByStage: ReadonlyMap<StageId, readonly StageSlot[]>;
  readonly slotById: ReadonlyMap<SlotId, StageSlot>;
  readonly fixturesByStage: ReadonlyMap<StageId, readonly Fixture[]>;
  readonly fixturesByPool: ReadonlyMap<PoolId, readonly Fixture[]>;
  readonly fixtureById: ReadonlyMap<FixtureId, Fixture>;
  readonly teamViews: ReadonlyMap<TeamId, TournamentTeamView>;
  readonly teamNames: ReadonlyMap<TeamId, string>;
  readonly seeds: ReadonlyMap<TeamId, number | null>;
  readonly activeOverrides: readonly TournamentOverride[];
}

const cache = new WeakMap<TournamentSnapshot, SnapshotIndex>();

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function indexSnapshot(snapshot: TournamentSnapshot): SnapshotIndex {
  const hit = cache.get(snapshot);
  if (hit) return hit;
  const poolsByStage = groupBy(snapshot.pools, (pool) => pool.stageId);
  poolsByStage.forEach((pools) => pools.sort((a, b) => a.orderIndex - b.orderIndex));
  const slotsByStage = groupBy(snapshot.slots, (slot) => slot.stageId);
  slotsByStage.forEach((slots) => slots.sort((a, b) => a.index - b.index));
  const fixturesByStage = groupBy(snapshot.fixtures, (fixture) => fixture.stageId);
  const fixturesByPool = new Map<PoolId, Fixture[]>();
  for (const fixture of snapshot.fixtures) {
    if (fixture.poolId === null) continue;
    const list = fixturesByPool.get(fixture.poolId);
    if (list) list.push(fixture);
    else fixturesByPool.set(fixture.poolId, [fixture]);
  }
  const index: SnapshotIndex = {
    snapshot,
    stagesOrdered: [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex),
    stageById: new Map(snapshot.stages.map((stage) => [stage.id, stage])),
    poolsByStage,
    poolById: new Map(snapshot.pools.map((pool) => [pool.id, pool])),
    entriesByPool: groupBy(snapshot.poolEntries, (entry) => entry.poolId),
    slotsByStage,
    slotById: new Map(snapshot.slots.map((slot) => [slot.id, slot])),
    fixturesByStage,
    fixturesByPool,
    fixtureById: new Map(snapshot.fixtures.map((fixture) => [fixture.id, fixture])),
    teamViews: new Map(snapshot.teams.map((view) => [view.team.id, view])),
    teamNames: new Map(snapshot.teams.map((view) => [view.team.id, view.team.name])),
    seeds: new Map(snapshot.teams.map((view) => [view.team.id, view.membership.seed])),
    activeOverrides: snapshot.overrides.filter(isActiveOverride),
  };
  cache.set(snapshot, index);
  return index;
}

export function teamName(index: SnapshotIndex, teamId: TeamId): string {
  return index.teamNames.get(teamId) ?? teamId;
}

export function stageName(index: SnapshotIndex, stageId: StageId): string {
  return index.stageById.get(stageId)?.name ?? 'next stage';
}

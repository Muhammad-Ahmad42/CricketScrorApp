import type { ChangePlan, Fixture, Pool, PoolEntry, ProposedChange, Stage, StageId, StageSlot } from '../../types';
import { bracketShape } from '../knockout';
import { expandEntryRules } from '../slots';
import type { SourceBracketShape } from '../slots';
import { deepEqual } from './equality';
import { emptyPlan, isDeletable } from './plan';
import type { PlanContext } from './plan';

type StageUpsert = Extract<ProposedChange, { readonly kind: 'stage_upsert' }>;
type StageDelete = Extract<ProposedChange, { readonly kind: 'stage_delete' }>;
type FixturesReplace = Extract<ProposedChange, { readonly kind: 'fixtures_replace' }>;

interface Structure {
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
}

interface Expansion {
  readonly stages: readonly Stage[];
  readonly upsert: readonly StageSlot[];
  readonly removed: readonly StageSlot[];
}

function sourcesOf(stage: Stage): ReadonlySet<StageId> {
  const ids = new Set<StageId>();
  for (const rule of stage.config.entryRules) {
    if (rule.kind !== 'manual' && rule.kind !== 'direct_entry') ids.add(rule.sourceStageId);
  }
  return ids;
}

function bracketSources(structure: Structure): ReadonlyMap<StageId, SourceBracketShape> {
  const shapes = new Map<StageId, SourceBracketShape>();
  for (const stage of structure.stages) {
    if (stage.type !== 'knockout') continue;
    const entrants = structure.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry').length;
    if (entrants < 2) continue;
    const shape = bracketShape(entrants, stage.config.knockout?.rounds ?? null);
    shapes.set(stage.id, { lastRound: shape.roundsPlayed, positions: shape.winners });
  }
  return shapes;
}

function poolsByStage(structure: Structure): ReadonlyMap<StageId, readonly Pool[]> {
  const map = new Map<StageId, Pool[]>();
  for (const pool of structure.pools) {
    const list = map.get(pool.stageId) ?? [];
    list.push(pool);
    map.set(pool.stageId, list);
  }
  return map;
}

export function reexpandDependents(ctx: PlanContext, structure: Structure, changed: ReadonlySet<StageId>): Expansion {
  const touched = new Set(changed);
  let slots = [...structure.slots];
  const upsert = new Map<string, StageSlot>();
  const removed = new Map<string, StageSlot>();
  const ordered = [...structure.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const stage of ordered) {
    if (touched.has(stage.id) || ![...sourcesOf(stage)].some((source) => touched.has(source))) continue;
    const existing = slots.filter((slot) => slot.stageId === stage.id);
    const expanded = expandEntryRules(
      stage.id,
      stage.config.entryRules,
      { pools: poolsByStage({ ...structure, slots }), brackets: bracketSources({ ...structure, slots }) },
      existing,
      ctx.ids,
    );
    const removedIds = new Set(expanded.removed.map((slot) => slot.id));
    expanded.removed.forEach((slot) => removed.set(slot.id, slot));
    for (const slot of expanded.slots) {
      const before = existing.find((candidate) => candidate.id === slot.id);
      if (!before || !deepEqual(before, slot)) upsert.set(slot.id, slot);
    }
    const expandedIds = new Set(expanded.slots.map((slot) => slot.id));
    slots = [...slots.filter((slot) => !removedIds.has(slot.id) && !expandedIds.has(slot.id)), ...expanded.slots];
    touched.add(stage.id);
  }
  return { stages: structure.stages, upsert: [...upsert.values()], removed: [...removed.values()] };
}

function withoutRemovedSlots(ctx: PlanContext, removed: readonly StageSlot[], entries: readonly PoolEntry[]): {
  readonly poolEntries: ChangePlan['poolEntries'];
  readonly deleteFixtures: readonly string[];
} {
  const ids = new Set(removed.map((slot) => slot.id));
  if (ids.size === 0) return { poolEntries: [], deleteFixtures: [] };
  const uses = (entry: PoolEntry) => entry.side.kind === 'slot' && ids.has(entry.side.slotId);
  const stages = new Set(entries.filter(uses).map((entry) => entry.stageId));
  const poolEntries = [...stages].map((stageId) => ({ stageId, entries: entries.filter((entry) => entry.stageId === stageId && !uses(entry)) }));
  const references = (fixture: Fixture) =>
    (fixture.sideA.kind === 'slot' && ids.has(fixture.sideA.slotId)) || (fixture.sideB.kind === 'slot' && ids.has(fixture.sideB.slotId));
  const deleteFixtures = ctx.snapshot.fixtures.filter((fixture) => isDeletable(ctx.snapshot, fixture) && references(fixture)).map((fixture) => fixture.id);
  return { poolEntries, deleteFixtures };
}

function mergeEntries(base: ChangePlan['poolEntries'], extra: ChangePlan['poolEntries']): ChangePlan['poolEntries'] {
  const map = new Map(base.map((group) => [group.stageId, group]));
  for (const group of extra) {
    const existing = map.get(group.stageId);
    if (!existing) {
      map.set(group.stageId, group);
      continue;
    }
    const keep = new Set(group.entries.map((entry) => entry.id));
    map.set(group.stageId, { stageId: group.stageId, entries: existing.entries.filter((entry) => keep.has(entry.id)) });
  }
  return [...map.values()];
}

function structureWith(ctx: PlanContext, stages: readonly Stage[], deletedStages: ReadonlySet<StageId>, pools: readonly Pool[], slots: readonly StageSlot[]): Structure {
  const snapshot = ctx.snapshot;
  const upsertStage = new Map(stages.map((stage) => [stage.id, stage]));
  const nextStages = [
    ...snapshot.stages.filter((stage) => !deletedStages.has(stage.id)).map((stage) => upsertStage.get(stage.id) ?? stage),
    ...stages.filter((stage) => !snapshot.stages.some((existing) => existing.id === stage.id)),
  ];
  return { stages: nextStages, pools, slots };
}

export function planStageUpsert(ctx: PlanContext, change: StageUpsert): ChangePlan {
  const stageId = change.stage.id;
  const snapshot = ctx.snapshot;
  const keepPools = new Set(change.pools.map((pool) => pool.id));
  const deletedPools = snapshot.pools.filter((pool) => pool.stageId === stageId && !keepPools.has(pool.id)).map((pool) => pool.id);
  const keepSlots = new Set(change.slots.map((slot) => slot.id));
  const deletedOwnSlots = snapshot.slots.filter((slot) => slot.stageId === stageId && !keepSlots.has(slot.id));
  const pools = [...snapshot.pools.filter((pool) => pool.stageId !== stageId), ...change.pools];
  const slots = [...snapshot.slots.filter((slot) => slot.stageId !== stageId), ...change.slots];
  const structure = structureWith(ctx, [change.stage], new Set(), pools, slots);
  const expansion = reexpandDependents(ctx, structure, new Set([stageId]));
  const removedSlots = [...deletedOwnSlots, ...expansion.removed];
  const deletedPoolSet = new Set(deletedPools);
  const ownEntries = snapshot.poolEntries.filter((entry) => entry.stageId === stageId);
  const entryGroups: ChangePlan['poolEntries'] = ownEntries.some((entry) => deletedPoolSet.has(entry.poolId))
    ? [{ stageId, entries: ownEntries.filter((entry) => !deletedPoolSet.has(entry.poolId)) }]
    : [];
  const cleanup = withoutRemovedSlots(ctx, removedSlots, snapshot.poolEntries);
  const poolFixtures = snapshot.fixtures.filter((fixture) => fixture.poolId !== null && deletedPoolSet.has(fixture.poolId) && isDeletable(snapshot, fixture));
  return {
    ...emptyPlan(),
    stages: { upsert: [change.stage], delete: [] },
    pools: { upsert: [...change.pools], delete: deletedPools },
    slots: { upsert: [...change.slots, ...expansion.upsert], delete: removedSlots.map((slot) => slot.id) },
    poolEntries: mergeEntries(entryGroups, cleanup.poolEntries),
    fixtures: { insert: [], update: [], delete: [...new Set([...cleanup.deleteFixtures, ...poolFixtures.map((fixture) => fixture.id)])] },
  };
}

export function planStageDelete(ctx: PlanContext, change: StageDelete): ChangePlan {
  const snapshot = ctx.snapshot;
  const stageId = change.stageId;
  const dependents = snapshot.stages
    .filter((stage) => stage.id !== stageId && sourcesOf(stage).has(stageId))
    .map((stage) => ({
      ...stage,
      updatedAt: ctx.now,
      config: {
        ...stage.config,
        entryRules: stage.config.entryRules.filter((rule) => rule.kind === 'manual' || rule.kind === 'direct_entry' || rule.sourceStageId !== stageId),
      },
    }));
  const pools = snapshot.pools.filter((pool) => pool.stageId !== stageId);
  const ownSlots = snapshot.slots.filter((slot) => slot.stageId === stageId);
  const slots = snapshot.slots.filter((slot) => slot.stageId !== stageId);
  const structure = structureWith(ctx, dependents, new Set([stageId]), pools, slots);
  const expansion = reexpandDependents(ctx, structure, new Set([stageId]));
  const cleanup = withoutRemovedSlots(ctx, expansion.removed, snapshot.poolEntries.filter((entry) => entry.stageId !== stageId));
  const ownFixtures = snapshot.fixtures.filter((fixture) => fixture.stageId === stageId).map((fixture) => fixture.id);
  return {
    ...emptyPlan(),
    stages: { upsert: dependents, delete: [stageId] },
    pools: { upsert: [], delete: snapshot.pools.filter((pool) => pool.stageId === stageId).map((pool) => pool.id) },
    slots: { upsert: expansion.upsert, delete: [...ownSlots, ...expansion.removed].map((slot) => slot.id) },
    poolEntries: [{ stageId, entries: [] }, ...cleanup.poolEntries],
    fixtures: { insert: [], update: [], delete: [...new Set([...ownFixtures, ...cleanup.deleteFixtures])] },
  };
}

export function planFixturesReplace(ctx: PlanContext, change: FixturesReplace): ChangePlan {
  const snapshot = ctx.snapshot;
  const scope = snapshot.fixtures.filter(
    (fixture) => fixture.stageId === change.stageId && (change.poolId === null || fixture.poolId === change.poolId),
  );
  const kept = scope.filter((fixture) => !isDeletable(snapshot, fixture));
  const referenced = new Set(
    kept.flatMap((fixture) => [fixture.sideA, fixture.sideB]).flatMap((side) => (side.kind === 'slot' ? [side.slotId] : [])),
  );
  const newSlotIds = new Set(change.slots.map((slot) => slot.id));
  const staleProgression = snapshot.slots.filter(
    (slot) => slot.stageId === change.stageId && slot.role === 'progression' && !newSlotIds.has(slot.id) && !referenced.has(slot.id),
  );
  const stage = ctx.index.stageById.get(change.stageId);
  const stages = stage ? [{ ...stage, config: { ...stage.config, seedingSeed: change.seed }, updatedAt: ctx.now }] : [];
  const staleIds = new Set(staleProgression.map((slot) => slot.id));
  const slots = [...snapshot.slots.filter((slot) => !newSlotIds.has(slot.id) && !staleIds.has(slot.id)), ...change.slots];
  const expansion = reexpandDependents(ctx, structureWith(ctx, stages, new Set(), snapshot.pools, slots), new Set([change.stageId]));
  const cleanup = withoutRemovedSlots(ctx, expansion.removed, snapshot.poolEntries);
  const removed = scope.filter((fixture) => isDeletable(snapshot, fixture)).map((fixture) => fixture.id);
  return {
    ...emptyPlan(),
    stages: { upsert: stages, delete: [] },
    slots: { upsert: [...change.slots, ...expansion.upsert], delete: [...staleProgression, ...expansion.removed].map((slot) => slot.id) },
    poolEntries: cleanup.poolEntries,
    fixtures: { insert: [...change.fixtures], update: [], delete: [...new Set([...removed, ...cleanup.deleteFixtures])] },
  };
}

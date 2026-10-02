import type { ChangePlan, Fixture, FixtureSide, PoolEntry, PoolId, ProposedChange } from '../../types';
import { sideEquals, sideKey } from '../evaluation/sides';
import { emptyPlan, isDeletable, isUnplayed, rewriteSides, stageEntries } from './plan';
import type { PlanContext } from './plan';

type PoolMove = Extract<ProposedChange, { readonly kind: 'pool_move' }>;
type PoolSwap = Extract<ProposedChange, { readonly kind: 'pool_swap' }>;
type PoolsReplace = Extract<ProposedChange, { readonly kind: 'pools_replace' }>;

function stillRemoved(ctx: PlanContext, fixtureId: string): boolean {
  const fixture = ctx.index.fixtureById.get(fixtureId);
  return !fixture || fixture.matchId !== null || isDeletable(ctx.snapshot, fixture);
}

export function planPoolMove(ctx: PlanContext, change: PoolMove): ChangePlan {
  const entries = stageEntries(ctx.snapshot, change.stageId);
  const moving = entries.find((entry) => sideEquals(entry.side, change.member));
  const nextEntries = moving ? [...entries.filter((entry) => entry !== moving), { ...moving, poolId: change.toPoolId }] : entries;
  return {
    ...emptyPlan(),
    poolEntries: [{ stageId: change.stageId, entries: nextEntries }],
    fixtures: { insert: [...change.addFixtures], update: [], delete: change.removeFixtureIds.filter((id) => stillRemoved(ctx, id)) },
  };
}

export function planPoolSwap(ctx: PlanContext, change: PoolSwap): ChangePlan {
  const entries = stageEntries(ctx.snapshot, change.stageId);
  const first = entries.find((entry) => sideEquals(entry.side, change.memberA));
  const second = entries.find((entry) => sideEquals(entry.side, change.memberB));
  if (!first || !second) return emptyPlan();
  const nextEntries = entries.map((entry): PoolEntry => {
    if (entry === first) return { ...first, side: second.side, seed: second.seed };
    if (entry === second) return { ...second, side: first.side, seed: first.seed };
    return entry;
  });
  const pools = new Set<PoolId>([first.poolId, second.poolId]);
  const rewrite = (side: FixtureSide): FixtureSide => {
    if (sideEquals(side, change.memberA)) return change.memberB;
    if (sideEquals(side, change.memberB)) return change.memberA;
    return side;
  };
  const update = ctx.snapshot.fixtures
    .filter((fixture) => fixture.stageId === change.stageId && fixture.poolId !== null && pools.has(fixture.poolId) && isUnplayed(fixture))
    .map((fixture) => rewriteSides(fixture, rewrite, ctx.now))
    .filter((fixture): fixture is Fixture => fixture !== null);
  return { ...emptyPlan(), poolEntries: [{ stageId: change.stageId, entries: nextEntries }], fixtures: { insert: [], update, delete: [] } };
}

export function planPoolsReplace(ctx: PlanContext, change: PoolsReplace): ChangePlan {
  const existing = stageEntries(ctx.snapshot, change.stageId);
  const entries = change.pools.flatMap((target) =>
    target.members.map((side): PoolEntry => {
      const old = existing.find((entry) => sideEquals(entry.side, side));
      return { id: old?.id ?? ctx.ids(), poolId: target.poolId, stageId: change.stageId, side, seed: old?.seed ?? null };
    }),
  );
  const poolOf = new Map(entries.map((entry) => [sideKey(entry.side), entry.poolId]));
  const invalid = ctx.snapshot.fixtures.filter((fixture) => {
    if (fixture.stageId !== change.stageId || fixture.poolId === null || !isDeletable(ctx.snapshot, fixture)) return false;
    return poolOf.get(sideKey(fixture.sideA)) !== fixture.poolId || poolOf.get(sideKey(fixture.sideB)) !== fixture.poolId;
  });
  const stage = ctx.index.stageById.get(change.stageId);
  return {
    ...emptyPlan(),
    stages: {
      upsert: stage ? [{ ...stage, config: { ...stage.config, seedingSeed: change.seed }, updatedAt: ctx.now }] : [],
      delete: [],
    },
    poolEntries: [{ stageId: change.stageId, entries }],
    fixtures: { insert: [], update: [], delete: invalid.map((fixture) => fixture.id) },
  };
}

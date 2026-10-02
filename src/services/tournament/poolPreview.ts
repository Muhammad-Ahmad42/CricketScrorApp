import { assignRandom, assignSeeded, assignSlotsToPools, distributePoolSizes, stageEntrants, type PoolAssignment } from '@/domain/tournament';
import type { FixtureSide, Pool, Stage, TournamentSnapshot } from '@/domain/types';
import type { PoolAssignmentMethod, TournamentService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure, ServiceFailure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { snapshotOfStage } from './snapshots';

type PoolPreviewOperations = Pick<TournamentService, 'previewPoolAssignment'>;

function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

function domainCall<T>(compute: () => T): T {
  try {
    return compute();
  } catch (error) {
    if (error instanceof ServiceFailure) {
      throw error;
    }
    throw failure('VALIDATION', "These pools can't be filled this way. Check the number of pools and teams.", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function fixedOrder(snapshot: TournamentSnapshot, stage: Stage, pools: readonly Pool[]): readonly (readonly number[])[] {
  const slots = snapshot.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry').sort((a, b) => a.index - b.index);
  const indexOf = new Map(slots.map((slot) => [slot.id, slot.index]));
  const existing = pools.map((pool) =>
    snapshot.poolEntries
      .filter((entry) => entry.poolId === pool.id && entry.side.kind === 'slot')
      .flatMap((entry) => (entry.side.kind === 'slot' ? [indexOf.get(entry.side.slotId) ?? -1] : []))
      .filter((index) => index >= 0),
  );
  if (existing.every((indexes) => indexes.length > 0) && existing.flat().length === slots.length) {
    return existing;
  }
  const sizes = distributePoolSizes(slots.length, pools.length);
  let cursor = 0;
  return sizes.map((size) => {
    const chunk = slots.slice(cursor, cursor + size).map((slot) => slot.index);
    cursor += size;
    return chunk;
  });
}

function manual(assignment: PoolAssignment, pools: readonly Pool[], entrants: readonly FixtureSide[]): PoolAssignment {
  const poolIds = new Set(pools.map((pool) => pool.id));
  const allowed = new Set(entrants.map(sideKey));
  const members = assignment.pools.flatMap((pool) => pool.members.map(sideKey));
  if (assignment.pools.some((pool) => !poolIds.has(pool.poolId))) {
    throw failure('VALIDATION', 'The arrangement uses a pool that is not part of this stage.');
  }
  if (members.some((member) => !allowed.has(member))) {
    throw failure('VALIDATION', 'The arrangement includes a team that does not enter this stage.');
  }
  if (new Set(members).size !== members.length) {
    throw failure('VALIDATION', 'A team can only be in one pool.');
  }
  return assignment;
}

function assign(ctx: ServiceContext, snapshot: TournamentSnapshot, stage: Stage, method: PoolAssignmentMethod): PoolAssignment {
  const pools = snapshot.pools.filter((pool) => pool.stageId === stage.id).sort((a, b) => a.orderIndex - b.orderIndex);
  if (pools.length === 0) {
    throw failure('VALIDATION', 'This stage has no pools. Add pools first.');
  }
  const poolIds = pools.map((pool) => pool.id);
  const entrants = stageEntrants(snapshot, stage.id);
  switch (method.kind) {
    case 'random':
      return domainCall(() => assignRandom(entrants, { poolCount: pools.length }, poolIds, method.seed ?? ctx.seeds()));
    case 'seeded': {
      const views = new Map(snapshot.teams.map((view) => [view.team.id, view]));
      const teams = entrants.flatMap((side) => {
        const view = side.kind === 'team' ? views.get(side.teamId) : undefined;
        return view === undefined ? [] : [{ teamId: view.team.id, seed: view.membership.seed, name: view.team.name }];
      });
      return domainCall(() => assignSeeded(teams, poolIds));
    }
    case 'from_slots': {
      const slots = snapshot.slots
        .filter((slot) => slot.stageId === stage.id && slot.role === 'entry')
        .map((slot) => ({ slotId: slot.id, index: slot.index }));
      const pattern =
        method.pattern === 'snake'
          ? ({ kind: 'snake' } as const)
          : ({ kind: 'fixed_order', slotIndexesPerPool: fixedOrder(snapshot, stage, pools) } as const);
      return domainCall(() => assignSlotsToPools(slots, poolIds, pattern));
    }
    case 'manual':
      return manual(method.assignment, pools, entrants);
    default: {
      const unreachable: never = method;
      return unreachable;
    }
  }
}

export function createPoolPreviewOperations(ctx: ServiceContext): PoolPreviewOperations {
  return {
    previewPoolAssignment(stageId, method) {
      return attempt(MESSAGES.tournamentLoad, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, stage } = await snapshotOfStage(ctx, repos, stageId);
          return assign(ctx, snapshot, stage, method);
        }),
      );
    },
  };
}

import type { FixtureSide, PoolId, Seed, SlotId, TeamId } from '../types';
import { mulberry32, shuffle } from './rng';
import { letterName, plural } from './structure/labels';
import { sameSide, sideKey } from './structure/sides';

export interface PoolAssignmentPool {
  readonly poolId: PoolId;
  readonly name: string;
  readonly members: readonly FixtureSide[];
}

export interface PoolAssignment {
  readonly pools: readonly PoolAssignmentPool[];
  readonly seed: Seed | null;
}

export type PoolWarningCode = 'UNEVEN_POOLS' | 'EMPTY_POOL' | 'SINGLE_TEAM_POOL' | 'TEAM_IN_MULTIPLE_POOLS' | 'UNASSIGNED_TEAMS';

export interface PoolWarning {
  readonly code: PoolWarningCode;
  readonly message: string;
  readonly poolIds: readonly PoolId[];
  readonly members: readonly FixtureSide[];
}

export function poolName(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`Pool index must be a non-negative integer, got ${index}.`);
  }
  return `Pool ${letterName(index)}`;
}

export function distributePoolSizes(teamCount: number, poolCount: number): readonly number[] {
  if (!Number.isInteger(poolCount) || poolCount < 1) {
    throw new RangeError(`At least one pool is needed, got ${poolCount}.`);
  }
  if (!Number.isInteger(teamCount) || teamCount < 0) {
    throw new RangeError(`Team count must be a non-negative integer, got ${teamCount}.`);
  }
  const base = Math.floor(teamCount / poolCount);
  const remainder = teamCount % poolCount;
  return Array.from({ length: poolCount }, (_, index) => (index < remainder ? base + 1 : base));
}

function buildPools(poolIds: readonly PoolId[], members: readonly (readonly FixtureSide[])[]): readonly PoolAssignmentPool[] {
  return poolIds.map((poolId, index) => ({ poolId, name: poolName(index), members: members[index] ?? [] }));
}

function snakePoolIndex(position: number, poolCount: number): number {
  const lap = Math.floor(position / poolCount);
  const offset = position % poolCount;
  return lap % 2 === 0 ? offset : poolCount - 1 - offset;
}

function dealSnake<T>(items: readonly T[], poolCount: number): readonly (readonly T[])[] {
  const pools: T[][] = Array.from({ length: poolCount }, () => []);
  items.forEach((item, position) => {
    pools[snakePoolIndex(position, poolCount)].push(item);
  });
  return pools;
}

function requirePools(poolIds: readonly PoolId[], memberCount: number): void {
  if (poolIds.length === 0 && memberCount > 0) {
    throw new RangeError('At least one pool is needed to assign members.');
  }
}

function resolveSizes(
  memberCount: number,
  spec: { readonly poolCount: number } | { readonly sizes: readonly number[] },
  poolIds: readonly PoolId[],
): readonly number[] {
  const sizes = 'sizes' in spec ? spec.sizes : distributePoolSizes(memberCount, spec.poolCount);
  if (sizes.length !== poolIds.length) {
    throw new RangeError(`Expected ${sizes.length} pool ids, got ${poolIds.length}.`);
  }
  if (sizes.some((size) => !Number.isInteger(size) || size < 0)) {
    throw new RangeError('Pool sizes must be non-negative integers.');
  }
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total !== memberCount) {
    throw new RangeError(`Pool sizes add up to ${total}, but there are ${memberCount} members.`);
  }
  return sizes;
}

export function assignRandom(
  members: readonly FixtureSide[],
  spec: { readonly poolCount: number } | { readonly sizes: readonly number[] },
  poolIds: readonly PoolId[],
  seed: Seed,
): PoolAssignment {
  const sizes = resolveSizes(members.length, spec, poolIds);
  const shuffled = shuffle(members, mulberry32(seed));
  let offset = 0;
  const grouped = sizes.map((size) => {
    const slice = shuffled.slice(offset, offset + size);
    offset += size;
    return slice;
  });
  return { pools: buildPools(poolIds, grouped), seed };
}

function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) {
    return la < lb ? -1 : 1;
  }
  if (a !== b) {
    return a < b ? -1 : 1;
  }
  return 0;
}

export function assignSeeded(
  teams: readonly { readonly teamId: TeamId; readonly seed: number | null; readonly name: string }[],
  poolIds: readonly PoolId[],
): PoolAssignment {
  requirePools(poolIds, teams.length);
  const ordered = [...teams].sort((a, b) => {
    if (a.seed !== null && b.seed !== null && a.seed !== b.seed) {
      return a.seed - b.seed;
    }
    if (a.seed === null && b.seed !== null) {
      return 1;
    }
    if (a.seed !== null && b.seed === null) {
      return -1;
    }
    return compareNames(a.name, b.name) || compareNames(a.teamId, b.teamId);
  });
  const sides: readonly FixtureSide[] = ordered.map((team) => ({ kind: 'team', teamId: team.teamId }));
  return { pools: buildPools(poolIds, dealSnake(sides, Math.max(poolIds.length, 1))), seed: null };
}

export function assignSlotsToPools(
  slots: readonly { readonly slotId: SlotId; readonly index: number }[],
  poolIds: readonly PoolId[],
  pattern: { readonly kind: 'snake' } | { readonly kind: 'fixed_order'; readonly slotIndexesPerPool: readonly (readonly number[])[] },
): PoolAssignment {
  requirePools(poolIds, slots.length);
  const toSide = (slotId: SlotId): FixtureSide => ({ kind: 'slot', slotId });
  if (pattern.kind === 'snake') {
    const ordered = [...slots].sort((a, b) => a.index - b.index).map((slot) => toSide(slot.slotId));
    return { pools: buildPools(poolIds, dealSnake(ordered, Math.max(poolIds.length, 1))), seed: null };
  }
  if (pattern.slotIndexesPerPool.length !== poolIds.length) {
    throw new RangeError(`Expected slot indexes for ${poolIds.length} pools, got ${pattern.slotIndexesPerPool.length}.`);
  }
  const byIndex = new Map(slots.map((slot) => [slot.index, slot.slotId]));
  const grouped = pattern.slotIndexesPerPool.map((indexes) =>
    indexes.map((index) => {
      const slotId = byIndex.get(index);
      if (slotId === undefined) {
        throw new RangeError(`No slot with index ${index}.`);
      }
      return toSide(slotId);
    }),
  );
  return { pools: buildPools(poolIds, grouped), seed: null };
}

function locate(assignment: PoolAssignment, member: FixtureSide): { readonly pool: number; readonly position: number } | null {
  for (let pool = 0; pool < assignment.pools.length; pool += 1) {
    const position = assignment.pools[pool].members.findIndex((candidate) => sameSide(candidate, member));
    if (position >= 0) {
      return { pool, position };
    }
  }
  return null;
}

function requireLocation(assignment: PoolAssignment, member: FixtureSide): { readonly pool: number; readonly position: number } {
  const location = locate(assignment, member);
  if (location === null) {
    throw new Error(`${sideKey(member)} is not in any pool.`);
  }
  return location;
}

function withMembers(assignment: PoolAssignment, update: (pool: PoolAssignmentPool, index: number) => readonly FixtureSide[]): PoolAssignment {
  return {
    ...assignment,
    pools: assignment.pools.map((pool, index) => ({ ...pool, members: update(pool, index) })),
  };
}

export function moveMember(assignment: PoolAssignment, member: FixtureSide, toPoolId: PoolId): PoolAssignment {
  const target = assignment.pools.findIndex((pool) => pool.poolId === toPoolId);
  if (target < 0) {
    throw new Error(`Unknown pool ${toPoolId}.`);
  }
  const current = locate(assignment, member);
  if (current !== null && current.pool === target) {
    return assignment;
  }
  return withMembers(assignment, (pool, index) => {
    const remaining = pool.members.filter((candidate) => !sameSide(candidate, member));
    return index === target ? [...remaining, member] : remaining;
  });
}

export function swapMembers(assignment: PoolAssignment, memberA: FixtureSide, memberB: FixtureSide): PoolAssignment {
  const a = requireLocation(assignment, memberA);
  const b = requireLocation(assignment, memberB);
  if (a.pool === b.pool && a.position === b.position) {
    return assignment;
  }
  return withMembers(assignment, (pool, index) =>
    pool.members.map((candidate, position) => {
      if (index === a.pool && position === a.position) {
        return memberB;
      }
      if (index === b.pool && position === b.position) {
        return memberA;
      }
      return candidate;
    }),
  );
}

export function replaceMember(assignment: PoolAssignment, outMember: FixtureSide, inMember: FixtureSide): PoolAssignment {
  const out = requireLocation(assignment, outMember);
  if (sameSide(outMember, inMember)) {
    return assignment;
  }
  if (locate(assignment, inMember) !== null) {
    throw new Error(`${sideKey(inMember)} is already in a pool; use a swap instead.`);
  }
  return withMembers(assignment, (pool, index) =>
    pool.members.map((candidate, position) => (index === out.pool && position === out.position ? inMember : candidate)),
  );
}

function unevenWarning(pools: readonly PoolAssignmentPool[]): readonly PoolWarning[] {
  const filled = pools.filter((pool) => pool.members.length > 0);
  const sizes = new Set(filled.map((pool) => pool.members.length));
  if (sizes.size <= 1) {
    return [];
  }
  return [
    {
      code: 'UNEVEN_POOLS',
      message: 'Teams in different pools may play different numbers of matches.',
      poolIds: filled.map((pool) => pool.poolId),
      members: [],
    },
  ];
}

function sizeWarnings(pools: readonly PoolAssignmentPool[]): readonly PoolWarning[] {
  return pools.flatMap((pool): readonly PoolWarning[] => {
    if (pool.members.length === 0) {
      return [{ code: 'EMPTY_POOL', message: `${pool.name} has no teams.`, poolIds: [pool.poolId], members: [] }];
    }
    if (pool.members.length === 1) {
      return [
        {
          code: 'SINGLE_TEAM_POOL',
          message: `${pool.name} has only one team, so it has no matches.`,
          poolIds: [pool.poolId],
          members: pool.members,
        },
      ];
    }
    return [];
  });
}

function duplicateWarnings(pools: readonly PoolAssignmentPool[]): readonly PoolWarning[] {
  const seen = new Map<string, { member: FixtureSide; pools: PoolAssignmentPool[]; count: number }>();
  for (const pool of pools) {
    for (const member of pool.members) {
      const key = sideKey(member);
      const entry = seen.get(key) ?? { member, pools: [], count: 0 };
      entry.count += 1;
      if (!entry.pools.includes(pool)) {
        entry.pools.push(pool);
      }
      seen.set(key, entry);
    }
  }
  return [...seen.values()]
    .filter((entry) => entry.count > 1)
    .map((entry): PoolWarning => ({
      code: 'TEAM_IN_MULTIPLE_POOLS',
      message:
        entry.pools.length > 1
          ? `A team is in more than one pool (${entry.pools.map((pool) => pool.name).join(', ')}).`
          : `A team is listed twice in ${entry.pools[0].name}.`,
      poolIds: entry.pools.map((pool) => pool.poolId),
      members: [entry.member],
    }));
}

function unassignedWarning(pools: readonly PoolAssignmentPool[], entrants: readonly FixtureSide[]): readonly PoolWarning[] {
  const assigned = new Set(pools.flatMap((pool) => pool.members.map(sideKey)));
  const seen = new Set<string>();
  const missing = entrants.filter((entrant) => {
    const key = sideKey(entrant);
    if (assigned.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  if (missing.length === 0) {
    return [];
  }
  return [
    {
      code: 'UNASSIGNED_TEAMS',
      message: `${plural(missing.length, 'team is', 'teams are')} not in a pool yet.`,
      poolIds: [],
      members: missing,
    },
  ];
}

export function poolWarnings(assignment: PoolAssignment, entrants: readonly FixtureSide[]): readonly PoolWarning[] {
  return [
    ...unevenWarning(assignment.pools),
    ...sizeWarnings(assignment.pools),
    ...duplicateWarnings(assignment.pools),
    ...unassignedWarning(assignment.pools, entrants),
  ];
}

import { assignRandom, assignSeeded, moveMember, poolWarnings, swapMembers, type PoolAssignment, type PoolWarning } from '@/domain/tournament/pools';
import { normalizeSeed } from '@/domain/tournament/rng';
import type { FixtureSide, PoolId, Seed, TeamId } from '@/domain/types';
import { sameSide } from './pools';

export interface PoolShell {
  readonly poolId: PoolId;
  readonly name: string;
}

function withNames(assignment: PoolAssignment, pools: readonly PoolShell[]): PoolAssignment {
  return {
    ...assignment,
    pools: assignment.pools.map((pool, index) => ({ ...pool, name: pools[index]?.name ?? pool.name })),
  };
}

export function parseSeed(text: string): Seed | null {
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : normalizeSeed(trimmed);
}

export function drawRandom(members: readonly FixtureSide[], pools: readonly PoolShell[], seed: Seed, sizes?: readonly number[]): PoolAssignment {
  const spec = sizes && sizes.reduce((sum, size) => sum + size, 0) === members.length ? { sizes } : { poolCount: pools.length };
  return withNames(assignRandom(members, spec, pools.map((pool) => pool.poolId), seed), pools);
}

export function drawSeeded(
  teams: readonly { readonly teamId: TeamId; readonly seed: number | null; readonly name: string }[],
  pools: readonly PoolShell[],
): PoolAssignment {
  return withNames(assignSeeded(teams, pools.map((pool) => pool.poolId)), pools);
}

export function emptyAssignment(pools: readonly PoolShell[]): PoolAssignment {
  return { pools: pools.map((pool) => ({ poolId: pool.poolId, name: pool.name, members: [] })), seed: null };
}

export function assignmentHasMembers(assignment: PoolAssignment | null): boolean {
  return assignment !== null && assignment.pools.some((pool) => pool.members.length > 0);
}

export function unassignedMembers(assignment: PoolAssignment | null, entrants: readonly FixtureSide[]): readonly FixtureSide[] {
  const assigned = assignment?.pools.flatMap((pool) => pool.members) ?? [];
  return entrants.filter((entrant) => !assigned.some((member) => sameSide(member, entrant)));
}

function manual(assignment: PoolAssignment): PoolAssignment {
  return { ...assignment, seed: null };
}

export function addToPool(assignment: PoolAssignment, member: FixtureSide, poolId: PoolId): PoolAssignment {
  const present = assignment.pools.some((pool) => pool.members.some((candidate) => sameSide(candidate, member)));
  if (present) {
    return manual(moveMember(assignment, member, poolId));
  }
  return {
    ...assignment,
    seed: null,
    pools: assignment.pools.map((pool) => (pool.poolId === poolId ? { ...pool, members: [...pool.members, member] } : pool)),
  };
}

export function removeFromPools(assignment: PoolAssignment, member: FixtureSide): PoolAssignment {
  return {
    ...assignment,
    seed: null,
    pools: assignment.pools.map((pool) => ({ ...pool, members: pool.members.filter((candidate) => !sameSide(candidate, member)) })),
  };
}

export function swapInAssignment(assignment: PoolAssignment, a: FixtureSide, b: FixtureSide): PoolAssignment {
  return manual(swapMembers(assignment, a, b));
}

export function reconcileAssignment(assignment: PoolAssignment | null, pools: readonly PoolShell[]): PoolAssignment {
  if (assignment === null) {
    return emptyAssignment(pools);
  }
  return {
    seed: assignment.seed,
    pools: pools.map((pool) => ({
      poolId: pool.poolId,
      name: pool.name,
      members: assignment.pools.find((candidate) => candidate.poolId === pool.poolId)?.members ?? [],
    })),
  };
}

export function warningsFor(assignment: PoolAssignment, entrants: readonly FixtureSide[]): readonly PoolWarning[] {
  return poolWarnings(assignment, entrants);
}

export function blockingWarnings(warnings: readonly PoolWarning[]): readonly PoolWarning[] {
  return warnings.filter((warning) => warning.code === 'EMPTY_POOL' || warning.code === 'TEAM_IN_MULTIPLE_POOLS' || warning.code === 'UNASSIGNED_TEAMS');
}

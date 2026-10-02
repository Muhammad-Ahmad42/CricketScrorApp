import { fixturesForPoolMove } from '@/domain/tournament/fixtures';
import type { PoolAssignment } from '@/domain/tournament/pools';
import type { FixtureSide, IdGenerator, PoolId, ProposedChange, StageId, TeamId } from '@/domain/types';
import { plural } from '@/features/shared';
import type { TournamentIndex } from './names';

export interface PoolMemberVM {
  readonly key: string;
  readonly side: FixtureSide;
  readonly label: string;
  readonly detail: string | null;
  readonly isSlot: boolean;
  readonly teamId: TeamId | null;
}

export interface PoolVM {
  readonly poolId: PoolId;
  readonly key: string;
  readonly name: string;
  readonly summary: string;
  readonly members: readonly PoolMemberVM[];
}

export function sideKey(side: FixtureSide): string {
  return side.kind === 'team' ? `team:${side.teamId}` : `slot:${side.slotId}`;
}

export function sameSide(a: FixtureSide, b: FixtureSide): boolean {
  return sideKey(a) === sideKey(b);
}

export function stagesWithPools(index: TournamentIndex): readonly StageId[] {
  return index.stages.filter((stage) => index.poolsOf(stage.id).length > 0).map((stage) => stage.id);
}

export function assignmentFromSnapshot(index: TournamentIndex, stageId: StageId): PoolAssignment {
  const pools = index.poolsOf(stageId).map((pool) => ({
    poolId: pool.id,
    name: pool.name,
    members: index.snapshot.poolEntries.filter((entry) => entry.poolId === pool.id).map((entry) => entry.side),
  }));
  const stage = index.stage(stageId);
  return { pools, seed: stage?.config.seedingSeed ?? null };
}

function playedCount(index: TournamentIndex, stageId: StageId, teamId: TeamId): number {
  return index.snapshot.fixtures.filter((fixture) => {
    if (fixture.stageId !== stageId || (fixture.status !== 'completed' && fixture.status !== 'abandoned')) {
      return false;
    }
    const sides = index.fixtureSides(fixture);
    return sides.a.teamId === teamId || sides.b.teamId === teamId;
  }).length;
}

export function memberVM(index: TournamentIndex, side: FixtureSide, detail: string | null): PoolMemberVM {
  const shown = index.side(side);
  if (side.kind === 'slot') {
    return {
      key: sideKey(side),
      side,
      label: shown.slotLabel ?? shown.text,
      detail: shown.teamId ? index.teamName(shown.teamId) : 'To be decided',
      isSlot: true,
      teamId: shown.teamId,
    };
  }
  return { key: sideKey(side), side, label: shown.text, detail, isSlot: false, teamId: side.teamId };
}

export function stagePoolsVM(index: TournamentIndex, stageId: StageId): readonly PoolVM[] {
  const assignment = assignmentFromSnapshot(index, stageId);
  return assignment.pools.map((pool) => {
    const fixtures = index.snapshot.fixtures.filter((fixture) => fixture.poolId === pool.poolId);
    const done = fixtures.filter((fixture) => fixture.status === 'completed' || fixture.status === 'abandoned').length;
    const members = pool.members.map((side) =>
      memberVM(index, side, side.kind === 'team' ? `${playedCount(index, stageId, side.teamId)} played` : null),
    );
    const parts = [plural(members.length, 'team')];
    if (fixtures.length > 0) {
      parts.push(`${done} of ${plural(fixtures.length, 'fixture')}`);
    }
    return { poolId: pool.poolId, key: index.poolKey(pool.poolId), name: pool.name, summary: parts.join(' · '), members };
  });
}

function nextMatchNumber(index: TournamentIndex): number {
  return index.snapshot.fixtures.reduce((max, fixture) => Math.max(max, fixture.matchNumber), 0) + 1;
}

export function poolMoveChange(
  index: TournamentIndex,
  stageId: StageId,
  member: FixtureSide,
  toPoolId: PoolId,
  ids: IdGenerator,
): ProposedChange | null {
  const assignment = assignmentFromSnapshot(index, stageId);
  const from = assignment.pools.find((pool) => pool.members.some((candidate) => sameSide(candidate, member)));
  const target = assignment.pools.find((pool) => pool.poolId === toPoolId);
  const stage = index.stage(stageId);
  if (!from || !target || !stage || from.poolId === toPoolId) {
    return null;
  }
  const pool = index.pool(toPoolId);
  const moves = fixturesForPoolMove(
    {
      member,
      fromPoolId: from.poolId,
      fixtures: index.snapshot.fixtures.filter((fixture) => fixture.stageId === stageId),
      targetMembers: target.members,
      legs: pool?.legs ?? stage.config.fixtureGeneration.legs,
      defaults: {
        tournamentId: index.snapshot.tournament.id,
        stageId,
        poolId: toPoolId,
        formatId: stage.config.formatId,
        matchRules: stage.config.matchRules,
        venueId: null,
        startMatchNumber: nextMatchNumber(index),
      },
    },
    ids,
  );
  const hasFixtures = index.snapshot.fixtures.some((fixture) => fixture.stageId === stageId);
  return {
    kind: 'pool_move',
    stageId,
    member,
    toPoolId,
    removeFixtureIds: moves.removeFixtureIds,
    addFixtures: hasFixtures ? moves.addFixtures : [],
  };
}

export function poolsReplaceChange(stageId: StageId, assignment: PoolAssignment): ProposedChange {
  return {
    kind: 'pools_replace',
    stageId,
    pools: assignment.pools.map((pool) => ({ poolId: pool.poolId, members: pool.members })),
    seed: assignment.seed,
  };
}

import type { PoolEntry, PoolId, SlotId, SlotResolution, Stage, StageId, TeamId } from '../../types';
import type { StandingsMember } from '../standings';
import type { SnapshotIndex } from './snapshotIndex';

export type SlotLookup = (slotId: SlotId) => SlotResolution | undefined;

export function inheritedChain(index: SnapshotIndex, teamId: TeamId): readonly TeamId[] {
  const chain: TeamId[] = [];
  const seen = new Set<TeamId>([teamId]);
  let current = index.teamViews.get(teamId)?.membership.inheritsFromTeamId ?? null;
  while (current !== null && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = index.teamViews.get(current)?.membership.inheritsFromTeamId ?? null;
  }
  return chain;
}

export function expungedForStage(index: SnapshotIndex, stageId: StageId): ReadonlySet<TeamId> {
  const set = new Set<TeamId>();
  for (const override of index.activeOverrides) {
    if (override.kind === 'expunge_results' && (override.stageId === null || override.stageId === stageId)) set.add(override.teamId);
  }
  return set;
}

function entryMember(index: SnapshotIndex, entry: PoolEntry, lookup: SlotLookup): StandingsMember {
  if (entry.side.kind === 'team') {
    const teamId = entry.side.teamId;
    return {
      side: entry.side,
      slotLabel: null,
      teamId,
      provisional: false,
      membership: index.teamViews.get(teamId)?.membership.status ?? 'active',
      inheritsFrom: inheritedChain(index, teamId),
    };
  }
  const slot = index.slotById.get(entry.side.slotId);
  const resolution = lookup(entry.side.slotId);
  const teamId = resolution?.teamId ?? null;
  return {
    side: entry.side,
    slotLabel: slot?.label ?? null,
    teamId,
    provisional: teamId !== null && resolution?.status !== 'final',
    membership: 'active',
    inheritsFrom: teamId === null ? [] : inheritedChain(index, teamId),
  };
}

function keptPredecessors(index: SnapshotIndex, members: readonly StandingsMember[], expunged: ReadonlySet<TeamId>, taken: Set<TeamId>): StandingsMember[] {
  const kept: StandingsMember[] = [];
  for (const member of members) {
    if (member.side.kind !== 'team' || member.teamId === null) continue;
    const successor = member.teamId;
    for (const view of index.snapshot.teams) {
      const predecessor = view.team.id;
      if (view.membership.status !== 'replaced' || view.membership.replacedByTeamId !== successor) continue;
      if (member.inheritsFrom.includes(predecessor) || expunged.has(predecessor) || taken.has(predecessor)) continue;
      taken.add(predecessor);
      kept.push({
        side: { kind: 'team', teamId: predecessor },
        slotLabel: null,
        teamId: predecessor,
        provisional: false,
        membership: 'replaced',
        inheritsFrom: [],
      });
    }
  }
  return kept;
}

function applyReassignments(index: SnapshotIndex, stage: Stage, byPool: Map<PoolId, StandingsMember[]>): void {
  for (const override of index.activeOverrides) {
    if (override.kind !== 'qualification' || override.action !== 'reassign' || override.stageId !== stage.id) continue;
    const targetPool = override.poolId;
    if (targetPool === null || !byPool.has(targetPool)) continue;
    const found: StandingsMember[] = [];
    for (const [poolId, members] of byPool) {
      const updated: StandingsMember[] = [];
      for (const member of members) {
        if (member.teamId !== override.teamId) updated.push(member);
        else {
          found.push(member);
          if (member.side.kind === 'slot') updated.push({ ...member, teamId: null, provisional: false, inheritsFrom: [] });
        }
      }
      byPool.set(poolId, updated);
    }
    const base: StandingsMember = found[0] ?? {
      side: { kind: 'team', teamId: override.teamId },
      slotLabel: null,
      teamId: override.teamId,
      provisional: false,
      membership: 'active',
      inheritsFrom: inheritedChain(index, override.teamId),
    };
    byPool.get(targetPool)?.push({ ...base, side: { kind: 'team', teamId: override.teamId }, slotLabel: null, teamId: override.teamId });
  }
}

export function stageMembers(index: SnapshotIndex, stage: Stage, lookup: SlotLookup): ReadonlyMap<PoolId, readonly StandingsMember[]> {
  const pools = index.poolsByStage.get(stage.id) ?? [];
  const expunged = expungedForStage(index, stage.id);
  const byPool = new Map<PoolId, StandingsMember[]>();
  const taken = new Set<TeamId>();
  for (const pool of pools) {
    const members = (index.entriesByPool.get(pool.id) ?? [])
      .filter((entry) => entry.stageId === stage.id)
      .map((entry) => entryMember(index, entry, lookup));
    members.forEach((member) => {
      if (member.teamId !== null) taken.add(member.teamId);
    });
    byPool.set(pool.id, members);
  }
  for (const pool of pools) {
    const members = byPool.get(pool.id) ?? [];
    byPool.set(pool.id, [...members, ...keptPredecessors(index, members, expunged, taken)]);
  }
  applyReassignments(index, stage, byPool);
  return byPool;
}

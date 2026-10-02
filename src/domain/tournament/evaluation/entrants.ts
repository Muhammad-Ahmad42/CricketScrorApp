import type { FixtureSide, StageId, TeamId } from '../../types';
import type { SnapshotIndex } from './snapshotIndex';

export function directEntries(index: SnapshotIndex, exceptStageId: StageId): ReadonlySet<TeamId> {
  const teams = new Set<TeamId>();
  for (const stage of index.snapshot.stages) {
    if (stage.id === exceptStageId) continue;
    for (const rule of stage.config.entryRules) {
      if (rule.kind === 'direct_entry') rule.teamIds.forEach((teamId) => teams.add(teamId));
    }
  }
  return teams;
}

export function entrantsOf(index: SnapshotIndex, stageId: StageId): readonly FixtureSide[] {
  const stage = index.stageById.get(stageId);
  if (!stage) return [];
  const entrySlots = (index.slotsByStage.get(stageId) ?? []).filter((slot) => slot.role === 'entry');
  if (entrySlots.length > 0) return entrySlots.map((slot): FixtureSide => ({ kind: 'slot', slotId: slot.id }));
  if (stage.config.entryRules.length > 0) return [];
  const direct = directEntries(index, stageId);
  return index.snapshot.teams
    .filter((view) => view.membership.status === 'active' && !direct.has(view.team.id))
    .map((view): FixtureSide => ({ kind: 'team', teamId: view.team.id }));
}

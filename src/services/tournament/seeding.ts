import type { SeededEntrant } from '@/domain/tournament';
import type { FixtureSide, Stage, StageEvaluation, StageSlot, TeamId, TournamentEvaluation, TournamentSnapshot } from '@/domain/types';

function poolIndexOf(snapshot: TournamentSnapshot, stageId: string, poolId: string): number | null {
  const pools = snapshot.pools.filter((pool) => pool.stageId === stageId).sort((a, b) => a.orderIndex - b.orderIndex);
  const index = pools.findIndex((pool) => pool.id === poolId);
  return index < 0 ? null : index;
}

function overallRank(source: StageEvaluation | undefined, teamId: TeamId): number | null {
  const rows = source?.overall?.rows ?? null;
  if (rows === null) {
    return null;
  }
  const index = rows.findIndex((row) => row.teamId === teamId);
  return index < 0 ? null : index + 1;
}

function slotEntrant(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation, slot: StageSlot, order: number): SeededEntrant {
  const side: FixtureSide = { kind: 'slot', slotId: slot.id };
  const resolution = evaluation.stages.flatMap((stage) => stage.slots).find((entry) => entry.slotId === slot.id);
  const teamId = resolution?.status === 'final' ? resolution.teamId : null;
  const source = slot.source;
  const sourceStage = 'stageId' in source ? evaluation.stages.find((stage) => stage.stageId === source.stageId) : undefined;
  const rank = teamId === null ? null : (overallRank(sourceStage, teamId) ?? order + 1);
  switch (source.kind) {
    case 'pool_position':
      return { side, rank, poolIndex: poolIndexOf(snapshot, source.stageId, source.poolId), poolPosition: source.position };
    case 'best_of_position':
      return { side, rank, poolIndex: null, poolPosition: source.position };
    default:
      return { side, rank, poolIndex: null, poolPosition: null };
  }
}

export function knockoutEntrants(
  snapshot: TournamentSnapshot,
  evaluation: TournamentEvaluation,
  stage: Stage,
  fallback: readonly FixtureSide[],
): readonly SeededEntrant[] {
  const entrySlots = snapshot.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry').sort((a, b) => a.index - b.index);
  if (entrySlots.length > 0) {
    return entrySlots.map((slot, order) => slotEntrant(snapshot, evaluation, slot, order));
  }
  const seeds = new Map(snapshot.teams.map((view) => [view.team.id, view.membership.seed]));
  return fallback.map((side) => ({
    side,
    rank: side.kind === 'team' ? (seeds.get(side.teamId) ?? null) : null,
    poolIndex: null,
    poolPosition: null,
  }));
}

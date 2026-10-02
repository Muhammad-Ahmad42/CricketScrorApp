import type { IdGenerator, IsoDateTime, PoolId, Seed, SlotId, StageId, TeamId, TournamentId, TournamentOverride } from '@/domain/types';

export type OverrideAction = 'qualify' | 'eliminate' | 'reassign' | 'points';

interface Base {
  readonly tournamentId: TournamentId;
  readonly reason: string;
  readonly ids: IdGenerator;
  readonly now: IsoDateTime;
}

function base(input: Base) {
  return {
    id: input.ids(),
    tournamentId: input.tournamentId,
    reason: input.reason.trim(),
    createdAt: input.now,
    revokedAt: null,
    revokeReason: null,
  };
}

export function teamOverride(
  input: Base & {
    readonly sourceStageId: StageId;
    readonly targetStageId: StageId | null;
    readonly teamId: TeamId;
    readonly poolId: PoolId | null;
    readonly action: OverrideAction;
    readonly slotId: SlotId | null;
    readonly points: number;
  },
): TournamentOverride | null {
  if (input.action === 'points') {
    return { ...base(input), kind: 'points_adjustment', stageId: input.sourceStageId, poolId: input.poolId, teamId: input.teamId, points: input.points };
  }
  if (input.targetStageId === null || (input.action !== 'eliminate' && input.slotId === null)) {
    return null;
  }
  return {
    ...base(input),
    kind: 'qualification',
    stageId: input.targetStageId,
    teamId: input.teamId,
    action: input.action,
    slotId: input.action === 'eliminate' ? null : input.slotId,
    poolId: null,
  };
}

export function overrideNeedsSlot(action: OverrideAction): boolean {
  return action === 'qualify' || action === 'reassign';
}

export function tieResolutionOverride(
  input: Base & {
    readonly stageId: StageId;
    readonly poolId: PoolId | null;
    readonly orderedTeamIds: readonly TeamId[];
    readonly method: 'organizer_decision' | 'draw_lots';
    readonly seed: Seed | null;
  },
): TournamentOverride {
  return {
    ...base(input),
    kind: 'tie_resolution',
    stageId: input.stageId,
    poolId: input.poolId,
    orderedTeamIds: input.orderedTeamIds,
    method: input.method,
    seed: input.method === 'draw_lots' ? input.seed : null,
  };
}

export function moveInList<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (to < 0 || to >= items.length || from === to) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

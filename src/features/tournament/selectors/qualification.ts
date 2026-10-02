import type { QualificationState, StageEvaluation, StageId, StageSlot, TeamId, TournamentOverride } from '@/domain/types';
import { QUALIFICATION_STATE_LABEL, type QualificationCertainty } from '@/features/shared';
import { formatDate } from './dates';
import type { TournamentIndex } from './names';
import { downstreamRulesText } from './standings';

export interface QualificationRowVM {
  readonly key: string;
  readonly teamId: TeamId;
  readonly team: string;
  readonly where: string | null;
  readonly slots: string | null;
  readonly state: QualificationState;
  readonly certainty: QualificationCertainty;
  readonly manual: boolean;
  readonly reason: string | null;
  readonly explanation: string;
  readonly poolId: string | null;
}

export interface QualificationSectionVM {
  readonly state: QualificationState;
  readonly title: string;
  readonly rows: readonly QualificationRowVM[];
}

export interface OverrideVM {
  readonly id: string;
  readonly text: string;
  readonly reason: string;
  readonly date: string | null;
}

export interface OverrideTargetVM {
  readonly stageId: StageId;
  readonly name: string;
  readonly slots: readonly StageSlot[];
}

export interface QualificationVM {
  readonly stageId: StageId;
  readonly stageName: string;
  readonly rulesText: string;
  readonly sections: readonly QualificationSectionVM[];
  readonly targets: readonly OverrideTargetVM[];
  readonly overrides: readonly OverrideVM[];
}

const STATE_ORDER: readonly QualificationState[] = ['qualified', 'in_contention', 'eliminated'];

export function overrideText(index: TournamentIndex, override: TournamentOverride): string {
  switch (override.kind) {
    case 'qualification': {
      const team = index.teamName(override.teamId);
      const slot = override.slotId ? index.slot(override.slotId)?.label ?? null : null;
      if (override.action === 'qualify') {
        return `${team} qualified for the ${index.stageName(override.stageId)}${slot ? ` as ${slot}` : ''}`;
      }
      if (override.action === 'eliminate') {
        return `${team} kept out of the ${index.stageName(override.stageId)}`;
      }
      return `${team} reassigned to ${slot ?? 'another slot'} in the ${index.stageName(override.stageId)}`;
    }
    case 'points_adjustment':
      return `${index.teamName(override.teamId)} ${override.points > 0 ? '+' : ''}${override.points} points in the ${index.stageName(override.stageId)}`;
    case 'tie_resolution': {
      const order = override.orderedTeamIds.map((teamId) => index.teamName(teamId)).join(' ahead of ');
      return override.method === 'draw_lots' ? `Tie decided by drawing lots: ${order}` : `Tie decided by the organizer: ${order}`;
    }
    case 'slot_assignment':
      return `${index.slot(override.slotId)?.label ?? 'Slot'}: ${index.teamName(override.teamId)}`;
    case 'expunge_results':
      return `${index.teamName(override.teamId)}'s results removed`;
    case 'champion':
      return `Champion set to ${override.teamIds.map((teamId) => index.teamName(teamId)).join(' and ')}`;
    default: {
      const unreachable: never = override;
      return unreachable;
    }
  }
}

export function activeOverrides(index: TournamentIndex): readonly OverrideVM[] {
  return index.snapshot.overrides
    .filter((override) => override.revokedAt === null)
    .map((override) => ({
      id: override.id,
      text: overrideText(index, override),
      reason: override.reason,
      date: formatDate(override.createdAt.slice(0, 10)),
    }));
}

export function overrideTargets(index: TournamentIndex, sourceStageId: StageId): readonly OverrideTargetVM[] {
  return index.stages
    .filter((stage) => stage.config.entryRules.some((rule) => 'sourceStageId' in rule && rule.sourceStageId === sourceStageId))
    .map((stage) => ({
      stageId: stage.id,
      name: stage.name,
      slots: index.snapshot.slots.filter((slot) => slot.stageId === stage.id && slot.role === 'entry').sort((a, b) => a.index - b.index),
    }));
}

export function qualificationVM(index: TournamentIndex, stage: StageEvaluation): QualificationVM {
  const rows: QualificationRowVM[] = stage.qualification.map((entry) => {
    const manual = entry.certainty === 'manual' || entry.override !== null;
    const slots = entry.slotIds.map((slotId) => index.slot(slotId)?.label).filter((label): label is string => Boolean(label));
    return {
      key: `${entry.stageId}:${entry.teamId}`,
      teamId: entry.teamId,
      team: index.teamName(entry.teamId),
      where: index.poolName(entry.poolId),
      slots: slots.length > 0 ? slots.join(', ') : null,
      state: entry.state,
      certainty: entry.certainty,
      manual,
      reason: entry.override?.reason ?? null,
      explanation: entry.explanation,
      poolId: entry.poolId,
    };
  });
  const sections = STATE_ORDER.map((state) => ({
    state,
    title: QUALIFICATION_STATE_LABEL[state],
    rows: rows.filter((row) => row.state === state),
  })).filter((section) => section.rows.length > 0);
  return {
    stageId: stage.stageId,
    stageName: index.stageName(stage.stageId),
    rulesText: downstreamRulesText(index, stage.stageId),
    sections,
    targets: overrideTargets(index, stage.stageId),
    overrides: activeOverrides(index),
  };
}

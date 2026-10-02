import type { SlotSource, Stage, StageId, StageSlot } from '../../types';
import { sourceStageId } from './downstream';
import type { SnapshotIndex } from './snapshotIndex';

export interface TargetSources {
  readonly slots: readonly StageSlot[];
  readonly winnerOnly: boolean;
}

function isWinnerSource(source: SlotSource): boolean {
  return source.kind === 'bracket_winner' || source.kind === 'fixture_winner';
}

export function targetSources(index: SnapshotIndex, sourceStage: StageId, target: Stage): TargetSources {
  const slots = (index.slotsByStage.get(target.id) ?? []).filter(
    (slot) => slot.role === 'entry' && sourceStageId(slot.source, index) === sourceStage,
  );
  return { slots, winnerOnly: slots.length > 0 && slots.every((slot) => isWinnerSource(slot.source)) };
}

export function rangeWithin(best: number, worst: number, positions: ReadonlySet<number>): boolean {
  if (best > worst) return false;
  for (let position = best; position <= worst; position += 1) {
    if (!positions.has(position)) return false;
  }
  return true;
}

export function rangeMeets(best: number, worst: number, positions: ReadonlySet<number>): boolean {
  for (const position of positions) {
    if (position >= best && position <= worst) return true;
  }
  return false;
}

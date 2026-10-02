import type { PoolId, SlotResolution, StageEvaluation } from '../../types';
import type { StandingsInput } from '../standings';
import type { SnapshotIndex } from './snapshotIndex';
import { buildStageInputs } from './stageTables';

const registry = new WeakMap<StageEvaluation, ReadonlyMap<PoolId, StandingsInput>>();

export function registerStageInputs(evaluation: StageEvaluation, inputs: ReadonlyMap<PoolId, StandingsInput>): void {
  registry.set(evaluation, inputs);
}

export function sourceStageInputs(
  index: SnapshotIndex,
  evaluation: StageEvaluation,
  earlier: readonly StageEvaluation[],
): ReadonlyMap<PoolId, StandingsInput> {
  const hit = registry.get(evaluation);
  if (hit) return hit;
  const stage = index.stageById.get(evaluation.stageId);
  if (!stage) return new Map();
  const resolutions = new Map<string, SlotResolution>();
  for (const candidate of [...earlier, evaluation]) {
    candidate.slots.forEach((resolution) => resolutions.set(resolution.slotId, resolution));
  }
  const { inputs } = buildStageInputs(index, stage, (slotId) => resolutions.get(slotId));
  registry.set(evaluation, inputs);
  return inputs;
}

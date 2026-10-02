import type { PoolId, SlotSource, Stage, StageId, StageSlot, UnevenPoolNormalization } from '../../types';
import type { SnapshotIndex } from './snapshotIndex';

export interface DownstreamSlot {
  readonly stage: Stage;
  readonly slot: StageSlot;
}

export function sourceStageId(source: SlotSource, index: SnapshotIndex): StageId | null {
  switch (source.kind) {
    case 'pool_position':
    case 'best_of_position':
    case 'overall_position':
    case 'bracket_winner':
    case 'bracket_loser':
      return source.stageId;
    case 'fixture_winner':
    case 'fixture_loser':
      return index.fixtureById.get(source.fixtureId)?.stageId ?? null;
    case 'manual':
      return null;
    default: {
      const never: never = source;
      return never;
    }
  }
}

export function downstreamEntrySlots(index: SnapshotIndex, stageId: StageId): readonly DownstreamSlot[] {
  const result: DownstreamSlot[] = [];
  for (const stage of index.stagesOrdered) {
    if (stage.id === stageId) continue;
    for (const slot of index.slotsByStage.get(stage.id) ?? []) {
      if (slot.role === 'entry' && sourceStageId(slot.source, index) === stageId) result.push({ stage, slot });
    }
  }
  return result;
}

export function targetStages(index: SnapshotIndex, stageId: StageId): readonly Stage[] {
  const seen = new Set<StageId>();
  const stages: Stage[] = [];
  for (const { stage } of downstreamEntrySlots(index, stageId)) {
    if (seen.has(stage.id)) continue;
    seen.add(stage.id);
    stages.push(stage);
  }
  return stages;
}

function addBoundary(set: Set<number>, position: number): void {
  if (position - 1 >= 1) set.add(position - 1);
  set.add(position);
}

export function poolBoundaries(index: SnapshotIndex, stage: Stage, poolId: PoolId, poolCount: number): ReadonlySet<number> {
  const boundaries = new Set<number>();
  for (const { slot } of downstreamEntrySlots(index, stage.id)) {
    const source = slot.source;
    if (source.kind === 'pool_position' && source.poolId === poolId) addBoundary(boundaries, source.position);
    if (source.kind === 'best_of_position') addBoundary(boundaries, source.position);
  }
  if (stage.config.decidesChampion && poolCount === 1) boundaries.add(1);
  return boundaries;
}

export interface ComparisonSpec {
  readonly key: string;
  readonly position: number | null;
  readonly normalization: UnevenPoolNormalization;
  readonly ranks: readonly number[];
}

export function comparisonKey(position: number | null, normalization: UnevenPoolNormalization): string {
  return position === null ? `overall:${normalization}` : `position:${position}:${normalization}`;
}

export function comparisonSpecs(index: SnapshotIndex, stageId: StageId): readonly ComparisonSpec[] {
  const specs = new Map<string, { position: number | null; normalization: UnevenPoolNormalization; ranks: number[] }>();
  for (const { slot } of downstreamEntrySlots(index, stageId)) {
    const source = slot.source;
    if (source.kind !== 'best_of_position' && source.kind !== 'overall_position') continue;
    const position = source.kind === 'best_of_position' ? source.position : null;
    const key = comparisonKey(position, source.normalization);
    const spec = specs.get(key) ?? { position, normalization: source.normalization, ranks: [] };
    spec.ranks.push(source.rank);
    specs.set(key, spec);
  }
  return [...specs.entries()].map(([key, spec]) => ({ key, ...spec }));
}

import type {
  ChampionResult,
  SlotResolution,
  StageEvaluation,
  StageId,
  StandingsTable,
  TeamQualification,
  TournamentSnapshot,
} from '../types';
import { championOf } from './evaluation/champion';
import { slotLookupOf, stageProgress } from './evaluation/pipeline';
import { qualifyStage } from './evaluation/qualify';
import { DEFAULT_ENUMERATION_LIMIT } from './evaluation/scenarios';
import { StageSlotResolver } from './evaluation/slotResolver';
import { indexSnapshot } from './evaluation/snapshotIndex';
import { buildComparisonTables, buildStageInputs } from './evaluation/stageTables';

export function resolveStageSlots(snapshot: TournamentSnapshot, stageId: StageId, earlier: readonly StageEvaluation[]): readonly SlotResolution[] {
  return new StageSlotResolver(indexSnapshot(snapshot), stageId, earlier).resolveAll();
}

export interface QualificationOptions {
  readonly enumerationLimit?: number;
}

export function computeQualification(
  snapshot: TournamentSnapshot,
  stageId: StageId,
  tables: readonly StandingsTable[],
  earlier: readonly StageEvaluation[],
  opts?: QualificationOptions,
): readonly TeamQualification[] {
  const index = indexSnapshot(snapshot);
  const stage = index.stageById.get(stageId);
  if (!stage) return [];
  const slots = resolveStageSlots(snapshot, stageId, earlier);
  const lookup = slotLookupOf(earlier, slots);
  const { membersByPool, inputs } = buildStageInputs(index, stage, lookup);
  const cross = tables.length > 0 ? buildComparisonTables(index, stage, tables, membersByPool, lookup) : { overall: null, comparisonTables: [] };
  const progress = stageProgress(index, stage);
  return qualifyStage({
    index,
    stage,
    tables,
    overall: cross.overall,
    comparisonTables: cross.comparisonTables,
    slots,
    inputs,
    earlier,
    limit: opts?.enumerationLimit ?? DEFAULT_ENUMERATION_LIMIT,
    progress,
    complete: progress.total > 0 && progress.done === progress.total,
  });
}

export function resolveChampion(snapshot: TournamentSnapshot, stages: readonly StageEvaluation[]): ChampionResult | null {
  return championOf(indexSnapshot(snapshot), stages);
}

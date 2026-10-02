import type {
  SlotResolution,
  Stage,
  StageEvaluation,
  StandingRow,
  StandingsTable,
  TeamQualification,
  TournamentEvaluation,
  TournamentSnapshot,
} from '../../types';
import { championOf } from './champion';
import { qualifyStage } from './qualify';
import { DEFAULT_ENUMERATION_LIMIT } from './scenarios';
import { isSettledStatus } from './sides';
import { StageSlotResolver } from './slotResolver';
import type { SnapshotIndex } from './snapshotIndex';
import { indexSnapshot } from './snapshotIndex';
import { registerStageInputs } from './sourceInputs';
import { buildStageTables } from './stageTables';

export interface EvaluationOptions {
  readonly enumerationLimit?: number;
}

export function stageProgress(index: SnapshotIndex, stage: Stage): { readonly done: number; readonly total: number } {
  const fixtures = index.fixturesByStage.get(stage.id) ?? [];
  return { done: fixtures.filter((fixture) => isSettledStatus(fixture.status)).length, total: fixtures.length };
}

function attachRows(table: StandingsTable, byTeam: ReadonlyMap<string, TeamQualification>): StandingsTable {
  if (byTeam.size === 0) return table;
  const rows = table.rows.map((row): StandingRow => {
    if (row.teamId === null || row.membership !== 'active') return row;
    const qualification = byTeam.get(row.teamId);
    return qualification ? { ...row, qualification } : row;
  });
  return { ...table, rows };
}

export function slotLookupOf(earlier: readonly StageEvaluation[], own: readonly SlotResolution[]): (slotId: string) => SlotResolution | undefined {
  const map = new Map<string, SlotResolution>();
  earlier.forEach((evaluation) => evaluation.slots.forEach((resolution) => map.set(resolution.slotId, resolution)));
  own.forEach((resolution) => map.set(resolution.slotId, resolution));
  return (slotId) => map.get(slotId);
}

export function evaluateStage(index: SnapshotIndex, stage: Stage, earlier: readonly StageEvaluation[], limit: number): StageEvaluation {
  const slots = new StageSlotResolver(index, stage.id, earlier).resolveAll();
  const lookup = slotLookupOf(earlier, slots);
  const built = buildStageTables(index, stage, lookup);
  const progress = stageProgress(index, stage);
  const complete = progress.total > 0 && progress.done === progress.total;
  const qualification = qualifyStage({
    index,
    stage,
    tables: built.tables,
    overall: built.overall,
    comparisonTables: built.comparisonTables,
    slots,
    inputs: built.inputs,
    earlier,
    limit,
    progress,
    complete,
  });
  const byTeam = new Map(qualification.map((entry) => [entry.teamId, entry]));
  const evaluation: StageEvaluation = {
    stageId: stage.id,
    tables: built.tables.map((table) => attachRows(table, byTeam)),
    overall: built.overall ? attachRows(built.overall, byTeam) : null,
    comparisonTables: built.comparisonTables.map((comparison) => ({ ...comparison, table: attachRows(comparison.table, byTeam) })),
    slots,
    qualification,
    progress,
    complete,
  };
  registerStageInputs(evaluation, built.inputs);
  return evaluation;
}

export function runEvaluation(snapshot: TournamentSnapshot, opts?: EvaluationOptions): TournamentEvaluation {
  const index = indexSnapshot(snapshot);
  const limit = opts?.enumerationLimit ?? DEFAULT_ENUMERATION_LIMIT;
  const stages: StageEvaluation[] = [];
  for (const stage of index.stagesOrdered) {
    stages.push(evaluateStage(index, stage, stages, limit));
  }
  const current = stages.find((evaluation) => !evaluation.complete) ?? stages[stages.length - 1] ?? null;
  const progress = stages.reduce(
    (total, evaluation) => ({ done: total.done + evaluation.progress.done, total: total.total + evaluation.progress.total }),
    { done: 0, total: 0 },
  );
  return {
    stages,
    currentStageId: current?.stageId ?? null,
    champion: championOf(index, stages),
    progress,
  };
}

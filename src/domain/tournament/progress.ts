import type { StageId, TournamentEvaluation, TournamentSnapshot } from '../types';
import { plural } from './evaluation/format';

export interface StageProgressLine {
  readonly stageId: StageId;
  readonly stageName: string;
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
}

export interface TournamentProgressSummary {
  readonly overall: { readonly done: number; readonly total: number };
  readonly current: StageProgressLine | null;
  readonly stages: readonly StageProgressLine[];
  readonly label: string;
  readonly countText: string;
  readonly ratio: number;
  readonly detail: string | null;
}

function ratioOf(done: number, total: number): number {
  return total === 0 ? 0 : done / total;
}

export function tournamentProgress(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation | null): TournamentProgressSummary {
  const ordered = [...snapshot.stages].sort((a, b) => a.orderIndex - b.orderIndex);
  const byStage = new Map((evaluation?.stages ?? []).map((stage) => [stage.stageId, stage.progress]));
  const stages = ordered.map((stage): StageProgressLine => {
    const progress = byStage.get(stage.id) ?? { done: 0, total: snapshot.fixtures.filter((fixture) => fixture.stageId === stage.id).length };
    return { stageId: stage.id, stageName: stage.name, done: progress.done, total: progress.total, complete: progress.total > 0 && progress.done === progress.total };
  });
  const overall = evaluation?.progress ?? { done: stages.reduce((sum, stage) => sum + stage.done, 0), total: snapshot.fixtures.length };
  const withFixtures = stages.filter((stage) => stage.total > 0);
  const currentId = evaluation?.currentStageId ?? null;
  const finished = overall.total > 0 && overall.done === overall.total;
  const current = finished ? null : (withFixtures.find((stage) => stage.stageId === currentId) ?? withFixtures.find((stage) => !stage.complete) ?? null);
  const single = withFixtures.length <= 1;
  if (current === null || single) {
    return {
      overall,
      current: single ? current : null,
      stages,
      label: single && current !== null ? current.stageName : 'Tournament',
      countText: `${overall.done} of ${overall.total}`,
      ratio: ratioOf(overall.done, overall.total),
      detail: `${overall.done} of ${plural(overall.total, 'match', 'matches')} played`,
    };
  }
  const position = (stageId: StageId) => ordered.findIndex((entry) => entry.id === stageId);
  const later = withFixtures.filter((stage) => stage.done < stage.total && position(stage.stageId) > position(current.stageId));
  const upcoming = later.map((stage) => `${stage.stageName}: ${plural(stage.total - stage.done, 'match', 'matches')}`);
  return {
    overall,
    current,
    stages,
    label: current.stageName,
    countText: `${current.done} of ${current.total}`,
    ratio: ratioOf(current.done, current.total),
    detail: [`${overall.done} of ${overall.total} overall`, ...upcoming].join(' · '),
  };
}

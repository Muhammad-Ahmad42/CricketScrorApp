import type { Fixture, FixtureSide, StageId, TeamId, TournamentEvaluation, TournamentSnapshot } from '../types';
import { entrantsOf } from './evaluation/entrants';
import { runEvaluation } from './evaluation/pipeline';
import { indexSnapshot } from './evaluation/snapshotIndex';
import type { QualificationOptions } from './qualification';

export function evaluateTournament(snapshot: TournamentSnapshot, opts?: QualificationOptions): TournamentEvaluation {
  return runEvaluation(snapshot, opts);
}

export function resolveSideTeam(evaluation: TournamentEvaluation, side: FixtureSide): TeamId | null {
  if (side.kind === 'team') return side.teamId;
  for (const stage of evaluation.stages) {
    const resolution = stage.slots.find((candidate) => candidate.slotId === side.slotId);
    if (resolution) return resolution.teamId;
  }
  return null;
}

export function resolveFixtureTeams(
  evaluation: TournamentEvaluation,
  fixture: Fixture,
): { readonly a: TeamId | null; readonly b: TeamId | null; readonly frozen: boolean } {
  if (fixture.matchSides) return { a: fixture.matchSides.teamAId, b: fixture.matchSides.teamBId, frozen: true };
  return { a: resolveSideTeam(evaluation, fixture.sideA), b: resolveSideTeam(evaluation, fixture.sideB), frozen: false };
}

export function stageEntrants(snapshot: TournamentSnapshot, stageId: StageId): readonly FixtureSide[] {
  return entrantsOf(indexSnapshot(snapshot), stageId);
}

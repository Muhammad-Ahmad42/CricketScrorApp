import { SCORING_PROJECTION_VERSION } from '@/domain/scoring';
import { evaluateTournament, tournamentEditPolicy, type TournamentEditPolicy } from '@/domain/tournament';
import type { Fixture, Stage, TournamentEvaluation, TournamentId, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import type { ServiceContext } from '../core/context';
import { failure } from '../core/result';
import { guardContext } from './status';

export const TOURNAMENT_NOT_FOUND = 'This tournament no longer exists. It may have been deleted.';

export async function readSnapshot(ctx: ServiceContext, repos: Repositories, tournamentId: TournamentId): Promise<TournamentSnapshot> {
  const snapshot = await repos.tournaments.getSnapshot(tournamentId, SCORING_PROJECTION_VERSION);
  if (snapshot === null) {
    throw failure('NOT_FOUND', TOURNAMENT_NOT_FOUND);
  }
  ctx.locator.remember(snapshot);
  return snapshot;
}

export interface EvaluatedSnapshot {
  readonly snapshot: TournamentSnapshot;
  readonly evaluation: TournamentEvaluation;
  readonly policy: TournamentEditPolicy;
}

export function evaluateSnapshot(snapshot: TournamentSnapshot): EvaluatedSnapshot {
  const evaluation = evaluateTournament(snapshot);
  return { snapshot, evaluation, policy: tournamentEditPolicy(snapshot.tournament.status, guardContext(snapshot, evaluation)) };
}

export async function readEvaluated(ctx: ServiceContext, repos: Repositories, tournamentId: TournamentId): Promise<EvaluatedSnapshot> {
  return evaluateSnapshot(await readSnapshot(ctx, repos, tournamentId));
}

async function scanFor(ctx: ServiceContext, repos: Repositories, has: (snapshot: TournamentSnapshot) => boolean): Promise<TournamentSnapshot | null> {
  const items = await repos.tournaments.list();
  for (const item of items) {
    const snapshot = await repos.tournaments.getSnapshot(item.id, SCORING_PROJECTION_VERSION);
    if (snapshot !== null) {
      ctx.locator.remember(snapshot);
      if (has(snapshot)) {
        return snapshot;
      }
    }
  }
  return null;
}

async function locate(
  ctx: ServiceContext,
  repos: Repositories,
  cached: TournamentId | null,
  has: (snapshot: TournamentSnapshot) => boolean,
  missing: string,
): Promise<TournamentSnapshot> {
  if (cached !== null) {
    const snapshot = await repos.tournaments.getSnapshot(cached, SCORING_PROJECTION_VERSION);
    if (snapshot !== null && has(snapshot)) {
      ctx.locator.remember(snapshot);
      return snapshot;
    }
  }
  const found = await scanFor(ctx, repos, has);
  if (found === null) {
    throw failure('NOT_FOUND', missing);
  }
  return found;
}

export async function snapshotOfStage(
  ctx: ServiceContext,
  repos: Repositories,
  stageId: string,
): Promise<{ readonly snapshot: TournamentSnapshot; readonly stage: Stage }> {
  const has = (snapshot: TournamentSnapshot) => snapshot.stages.some((stage) => stage.id === stageId);
  const snapshot = await locate(ctx, repos, ctx.locator.ownerOfStage(stageId), has, 'This stage no longer exists. It may have been deleted.');
  const stage = snapshot.stages.find((entry) => entry.id === stageId);
  if (stage === undefined) {
    throw failure('NOT_FOUND', 'This stage no longer exists. It may have been deleted.');
  }
  return { snapshot, stage };
}

export async function snapshotOfFixture(
  ctx: ServiceContext,
  repos: Repositories,
  fixtureId: string,
): Promise<{ readonly snapshot: TournamentSnapshot; readonly fixture: Fixture }> {
  const has = (snapshot: TournamentSnapshot) => snapshot.fixtures.some((fixture) => fixture.id === fixtureId);
  const snapshot = await locate(ctx, repos, ctx.locator.ownerOfFixture(fixtureId), has, 'This fixture no longer exists. It may have been deleted.');
  const fixture = snapshot.fixtures.find((entry) => entry.id === fixtureId);
  if (fixture === undefined) {
    throw failure('NOT_FOUND', 'This fixture no longer exists. It may have been deleted.');
  }
  return { snapshot, fixture };
}

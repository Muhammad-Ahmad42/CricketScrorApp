import type { ChangePlan, Fixture, IsoDateTime, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import type { ServiceContext } from '../core/context';
import { failure } from '../core/result';
import { newMatchRow, startLog } from '../match/creation';

function currentFixture(snapshot: TournamentSnapshot, plan: ChangePlan, fixtureId: string): Fixture {
  const updated = plan.fixtures.update.find((fixture) => fixture.id === fixtureId);
  const existing = updated ?? snapshot.fixtures.find((fixture) => fixture.id === fixtureId);
  if (existing === undefined) {
    throw failure('NOT_FOUND', 'A fixture in this change no longer exists.');
  }
  return existing;
}

export async function persistPlan(
  ctx: ServiceContext,
  repos: Repositories,
  snapshot: TournamentSnapshot,
  plan: ChangePlan,
  now: IsoDateTime,
): Promise<void> {
  if (plan.summaryChanges.length > 0) {
    throw failure('VALIDATION', 'Correct match results from the match scorecard.');
  }
  const tournamentId = snapshot.tournament.id;
  await repos.tournaments.applyPlanRows(tournamentId, plan, now);
  for (const created of plan.matchesToCreate) {
    const fixture = currentFixture(snapshot, plan, created.fixtureId);
    const match = await newMatchRow(repos, created.match, created.matchId, now);
    await repos.matches.insert(match, created.match.squads);
    await repos.tournaments.updateFixture({ ...fixture, matchId: created.matchId, matchSides: null, updatedAt: now });
    await startLog(ctx, repos, match, created.events, now);
  }
}

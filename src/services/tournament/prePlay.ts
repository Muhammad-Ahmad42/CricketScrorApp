import { canTransitionFixture } from '@/domain/tournament';
import type { IsoDateTime, Match, MatchStatus } from '@/domain/types';
import type { Repositories } from '@/db';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { failure } from '../core/result';
import { assertTournamentWritable, refreshTournamentProjection } from './matchEffects';
import { readSnapshot } from './snapshots';
import { mirrorFixtureStatus, replayAllowed } from './status';

export interface PrePlayMirror {
  readonly match: Match;
  readonly previous: MatchStatus;
  readonly reason: string | null;
  readonly now: IsoDateTime;
}

export async function mirrorPrePlayStatus(ctx: ServiceContext, repos: Repositories, input: PrePlayMirror): Promise<void> {
  const { match } = input;
  if (match.tournamentId === null) {
    return;
  }
  const snapshot = await readSnapshot(ctx, repos, match.tournamentId);
  assertTournamentWritable(snapshot);
  const fixture = snapshot.fixtures.find((entry) => entry.id === match.fixtureId && entry.matchId === match.id);
  if (fixture === undefined) {
    return;
  }
  const target = mirrorFixtureStatus(match.status, fixture.status);
  if (target !== fixture.status) {
    const stage = snapshot.stages.find((entry) => entry.id === fixture.stageId);
    const guard = canTransitionFixture(fixture.status, target, { hasMatch: true, replayAllowed: replayAllowed(stage) });
    if (!guard.ok) {
      throw failure('FORBIDDEN_STATE', guard.reason);
    }
    await repos.tournaments.updateFixture({ ...fixture, status: target, updatedAt: input.now });
  }
  await writeAudit(
    ctx,
    repos,
    {
      tournamentId: match.tournamentId,
      matchId: match.id,
      action: 'fixture_status_changed',
      entityType: 'fixture',
      entityId: fixture.id,
      summary: `${match.title} is now ${match.status}.`,
      previousValue: { matchStatus: input.previous, fixtureStatus: fixture.status },
      newValue: { matchStatus: match.status, fixtureStatus: target },
      reason: input.reason,
    },
    input.now,
  );
  await refreshTournamentProjection(ctx, repos, match.tournamentId, input.now);
}

import { canTransitionFixture, evaluateTournament } from '@/domain/tournament';
import type { Fixture, IsoDateTime, Match, MatchId, MatchStatus, Stage, TournamentId, TournamentSnapshot } from '@/domain/types';
import type { Repositories } from '@/db';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { failure } from '../core/result';
import { readSnapshot } from './snapshots';
import { desiredStageStatus, isMirrorRevert, mirrorFixtureStatus, replayAllowed } from './status';

export interface MatchEffectsInput {
  readonly tournamentId: TournamentId;
  readonly matchId: MatchId;
  readonly fixtureId: string | null;
  readonly matchStatus: MatchStatus;
  readonly summaryChanged: boolean;
  readonly reopened?: boolean;
  readonly reason?: string | null;
  readonly now: IsoDateTime;
}

export const ARCHIVED_MESSAGE = 'This tournament is archived. Unarchive it before making changes.';

function mirroredFixture(snapshot: TournamentSnapshot, input: MatchEffectsInput): Fixture | null {
  const fixture = snapshot.fixtures.find((entry) => entry.id === input.fixtureId && entry.matchId === input.matchId);
  if (fixture === undefined) {
    return null;
  }
  const target = mirrorFixtureStatus(input.matchStatus, fixture.status);
  if (target === fixture.status) {
    return null;
  }
  if (!isMirrorRevert(fixture.status, target)) {
    const stage = snapshot.stages.find((entry) => entry.id === fixture.stageId);
    const guard = canTransitionFixture(fixture.status, target, { hasMatch: true, replayAllowed: replayAllowed(stage) });
    if (!guard.ok) {
      throw failure('FORBIDDEN_STATE', guard.reason);
    }
  }
  return { ...fixture, status: target, updatedAt: input.now };
}

function changedStages(stages: readonly Stage[], fixtures: readonly Fixture[], now: IsoDateTime): readonly Stage[] {
  return stages.flatMap((stage) => {
    const status = desiredStageStatus(stage, fixtures);
    return status === stage.status ? [] : [{ ...stage, status, updatedAt: now }];
  });
}

export async function syncStructureStatuses(
  ctx: ServiceContext,
  repos: Repositories,
  snapshot: TournamentSnapshot,
  now: IsoDateTime,
  updatedFixtures: readonly Fixture[] = [],
): Promise<boolean> {
  const replaced = new Map(updatedFixtures.map((fixture) => [fixture.id, fixture]));
  const fixtures = snapshot.fixtures.map((fixture) => replaced.get(fixture.id) ?? fixture);
  const stages = changedStages(snapshot.stages, fixtures, now);
  if (stages.length > 0) {
    await repos.tournaments.upsertStages(stages);
  }
  const tournament = snapshot.tournament;
  const anyStarted = fixtures.some((fixture) => fixture.matchId !== null);
  if (tournament.status === 'fixtures_generated' && anyStarted) {
    await repos.tournaments.update({ ...tournament, status: 'active', updatedAt: now });
    await writeAudit(
      ctx,
      repos,
      {
        tournamentId: tournament.id,
        action: 'tournament_status_changed',
        entityType: 'tournament',
        entityId: tournament.id,
        summary: 'The tournament became active when its first match started.',
        previousValue: { status: tournament.status },
        newValue: { status: 'active' },
      },
      now,
    );
    return true;
  }
  return stages.length > 0;
}

export async function refreshTournamentProjection(ctx: ServiceContext, repos: Repositories, tournamentId: TournamentId, now: IsoDateTime): Promise<TournamentSnapshot> {
  await repos.tournaments.bumpRevision(tournamentId);
  const snapshot = await readSnapshot(ctx, repos, tournamentId);
  const tournament = { ...snapshot.tournament, updatedAt: now };
  await repos.tournaments.update(tournament);
  const champion = evaluateTournament(snapshot).champion;
  await repos.tournaments.writeChampion(tournamentId, champion === null ? null : champion.teamIds);
  return { ...snapshot, tournament };
}

async function reopenCompletedTournament(ctx: ServiceContext, repos: Repositories, snapshot: TournamentSnapshot, input: MatchEffectsInput): Promise<boolean> {
  const tournament = snapshot.tournament;
  if (input.reopened !== true || tournament.status !== 'completed') {
    return false;
  }
  await repos.tournaments.update({ ...tournament, status: 'active', updatedAt: input.now });
  await writeAudit(
    ctx,
    repos,
    {
      tournamentId: tournament.id,
      matchId: input.matchId,
      action: 'tournament_status_changed',
      entityType: 'tournament',
      entityId: tournament.id,
      summary: `${tournament.name} is active again because a match was reopened.`,
      previousValue: { status: tournament.status },
      newValue: { status: 'active' },
      reason: input.reason ?? null,
    },
    input.now,
  );
  return true;
}

export async function applyMatchEffects(ctx: ServiceContext, repos: Repositories, input: MatchEffectsInput): Promise<TournamentSnapshot | null> {
  const snapshot = await readSnapshot(ctx, repos, input.tournamentId);
  assertTournamentWritable(snapshot);
  const fixture = mirroredFixture(snapshot, input);
  if (fixture !== null) {
    await repos.tournaments.updateFixture(fixture);
  }
  const structural = await syncStructureStatuses(ctx, repos, snapshot, input.now, fixture === null ? [] : [fixture]);
  const reopened = await reopenCompletedTournament(ctx, repos, snapshot, input);
  if (fixture === null && !structural && !reopened && !input.summaryChanged) {
    return null;
  }
  return refreshTournamentProjection(ctx, repos, input.tournamentId, input.now);
}

export function assertTournamentWritable(snapshot: TournamentSnapshot): void {
  if (snapshot.tournament.status === 'archived') {
    throw failure('FORBIDDEN_STATE', ARCHIVED_MESSAGE);
  }
}

export const SUPERSEDED_MESSAGE = "This match was replaced by a replay. It stays on record and can't be changed.";

export async function assertMatchTournamentWritable(repos: Repositories, match: Pick<Match, 'id' | 'tournamentId' | 'fixtureId'>): Promise<void> {
  const tournamentId = match.tournamentId;
  if (tournamentId === null) {
    return;
  }
  const archived = await repos.tournaments.list({ statuses: ['archived'] });
  if (archived.some((item) => item.id === tournamentId)) {
    throw failure('FORBIDDEN_STATE', ARCHIVED_MESSAGE);
  }
  if (match.fixtureId !== null && (await repos.matches.isSuperseded(match.id))) {
    throw failure('FORBIDDEN_STATE', SUPERSEDED_MESSAGE);
  }
}

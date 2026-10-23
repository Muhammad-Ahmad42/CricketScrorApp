import { canTransitionFixture, canTransitionMatch, isFixtureReplay } from '@/domain/tournament';
import type { AuditAction, Fixture, FixturePatch, FixtureStatus, MatchStatus } from '@/domain/types';
import type { Repositories } from '@/db';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { isIsoDate, isLocalTime, trimmedOrNull } from '../core/values';
import { applyProposedChange } from './changes';
import { assertTournamentWritable, refreshTournamentProjection, syncStructureStatuses } from './matchEffects';
import { evaluateSnapshot, snapshotOfFixture } from './snapshots';
import { replayAllowed } from './status';

type FixtureUpdateOperations = Pick<TournamentService, 'updateFixture'>;

const STRUCTURAL: readonly (keyof FixturePatch)[] = ['sideA', 'sideB', 'stageId', 'poolId', 'isFinal'];
const SCHEDULE: readonly (keyof FixturePatch)[] = ['scheduledDate', 'scheduledTime', 'venueId'];
const RULES: readonly (keyof FixturePatch)[] = ['formatId', 'matchRules'];
const PLAYED: readonly FixtureStatus[] = ['live', 'completed', 'abandoned'];

function touches(patch: FixturePatch, keys: readonly (keyof FixturePatch)[]): boolean {
  return keys.some((key) => patch[key] !== undefined);
}

function matchStatusFor(status: FixtureStatus): MatchStatus | null {
  switch (status) {
    case 'postponed':
      return 'postponed';
    case 'cancelled':
      return 'cancelled';
    case 'scheduled':
    case 'rescheduled':
      return 'scheduled';
    default:
      return null;
  }
}

async function followWithMatch(repos: Repositories, fixture: Fixture, status: FixtureStatus, now: string): Promise<void> {
  if (fixture.matchId === null) {
    return;
  }
  const match = await repos.matches.get(fixture.matchId);
  const target = matchStatusFor(status);
  if (match === null || target === null || match.status === target) {
    return;
  }
  const guard = canTransitionMatch(match.status, target, { hasDeliveries: false });
  if (!guard.ok) {
    throw failure('FORBIDDEN_STATE', guard.reason);
  }
  await repos.matches.update({ ...match, status: target, updatedAt: now });
}

function validatedSchedule(patch: FixturePatch): void {
  const date = trimmedOrNull(patch.scheduledDate);
  const time = trimmedOrNull(patch.scheduledTime);
  if (date !== null && !isIsoDate(date)) {
    throw failure('VALIDATION', 'Enter the date as YYYY-MM-DD.');
  }
  if (time !== null && !isLocalTime(time)) {
    throw failure('VALIDATION', 'Enter the time as HH:MM.');
  }
}

function replayPatch(patch: FixturePatch): FixturePatch {
  return {
    status: 'rescheduled',
    ...(patch.scheduledDate === undefined ? {} : { scheduledDate: trimmedOrNull(patch.scheduledDate) }),
    ...(patch.scheduledTime === undefined ? {} : { scheduledTime: trimmedOrNull(patch.scheduledTime) }),
    ...(patch.venueId === undefined ? {} : { venueId: patch.venueId }),
    ...(patch.notes === undefined ? {} : { notes: trimmedOrNull(patch.notes) }),
    ...(patch.label === undefined ? {} : { label: trimmedOrNull(patch.label) }),
  };
}

function auditAction(patch: FixturePatch, statusChanged: boolean): AuditAction {
  if (statusChanged) {
    return 'fixture_status_changed';
  }
  return touches(patch, SCHEDULE) && !touches(patch, [...RULES, 'notes', 'label']) ? 'fixture_rescheduled' : 'fixture_changed';
}

export function createFixtureUpdateOperations(ctx: ServiceContext): FixtureUpdateOperations {
  return {
    updateFixture(fixtureId, patch, reason) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, fixture } = await snapshotOfFixture(ctx, repos, fixtureId);
          assertTournamentWritable(snapshot);
          const { policy } = evaluateSnapshot(snapshot);
          const why = trimmedOrNull(reason);
          if (touches(patch, STRUCTURAL)) {
            if (policy.fixtureTeams !== 'allowed') {
              throw failure('CONFIRMATION_REQUIRED', 'This change can move results between teams. Review its impact first.');
            }
            return applyProposedChange(ctx, repos, snapshot.tournament.id, { kind: 'fixture_update', fixtureId, patch }, {
              reason: why,
              version: snapshot.version,
              previewed: null,
              reasonOptional: true,
            });
          }
          validatedSchedule(patch);
          if (isFixtureReplay(fixture, patch)) {
            if (touches(patch, RULES)) {
              throw failure('FORBIDDEN_STATE', "This fixture's match has started. Change its rules from the match instead.");
            }
            return applyProposedChange(ctx, repos, snapshot.tournament.id, { kind: 'fixture_update', fixtureId, patch: replayPatch(patch) }, {
              reason: why,
              version: snapshot.version,
              previewed: null,
            });
          }
          const requested = patch.status ?? fixture.status;
          if (touches(patch, SCHEDULE) && (PLAYED.includes(fixture.status) || policy.fixtureSchedule === 'forbidden')) {
            throw failure('FORBIDDEN_STATE', "This fixture has been played. Its date, time and venue can't change.");
          }
          if (touches(patch, RULES) && fixture.matchId !== null) {
            throw failure('FORBIDDEN_STATE', "This fixture's match has started. Change its rules from the match instead.");
          }
          const now = ctx.clock.now();
          const status = requested;
          const statusChanged = status !== fixture.status;
          const stage = snapshot.stages.find((entry) => entry.id === fixture.stageId);
          if (statusChanged) {
            const guard = canTransitionFixture(fixture.status, status, { hasMatch: fixture.matchId !== null, replayAllowed: replayAllowed(stage) });
            if (!guard.ok) {
              throw failure('FORBIDDEN_STATE', guard.reason);
            }
            await followWithMatch(repos, fixture, status, now);
          }
          const next: Fixture = {
            ...fixture,
            scheduledDate: patch.scheduledDate === undefined ? fixture.scheduledDate : trimmedOrNull(patch.scheduledDate),
            scheduledTime: patch.scheduledTime === undefined ? fixture.scheduledTime : trimmedOrNull(patch.scheduledTime),
            venueId: patch.venueId === undefined ? fixture.venueId : patch.venueId,
            formatId: patch.formatId === undefined ? fixture.formatId : patch.formatId,
            matchRules: patch.matchRules === undefined ? fixture.matchRules : patch.matchRules,
            notes: patch.notes === undefined ? fixture.notes : trimmedOrNull(patch.notes),
            label: patch.label === undefined ? fixture.label : trimmedOrNull(patch.label),
            status,
            updatedAt: now,
          };
          await repos.tournaments.updateFixture(next);
          await syncStructureStatuses(ctx, repos, snapshot, now, [next]);
          const restored = fixture.status === 'cancelled' && statusChanged;
          if (restored || snapshot.tournament.status === 'active' || snapshot.tournament.status === 'completed') {
            await writeAudit(
              ctx,
              repos,
              {
                tournamentId: snapshot.tournament.id,
                action: auditAction(patch, statusChanged),
                entityType: 'fixture',
                entityId: fixtureId,
                summary: statusChanged
                  ? `Match ${fixture.matchNumber} is now ${status}.`
                  : `Match ${fixture.matchNumber} was updated.`,
                previousValue: fixture,
                newValue: next,
                reason: why,
              },
              now,
            );
          }
          return refreshTournamentProjection(ctx, repos, snapshot.tournament.id, now);
        }),
      );
    },
  };
}

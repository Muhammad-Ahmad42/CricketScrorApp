import { resolveFixtureTeams } from '@/domain/tournament';
import type {
  Fixture,
  FormatId,
  IsoDate,
  LocalTime,
  MatchRules,
  NewMatchInput,
  TeamId,
  TournamentEvaluation,
  TournamentSnapshot,
  VenueId,
} from '@/domain/types';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { assertSquadSizes, newMatchRow, startLog, validateNewMatch } from '../match/creation';
import { applyMatchEffects, assertTournamentWritable } from './matchEffects';
import { snapshotOfFixture, evaluateSnapshot } from './snapshots';

type FixtureMatchOperations = Pick<TournamentService, 'startFixtureMatch'>;

export interface FixtureMatchDefaults {
  readonly title: string;
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
  readonly formatId: FormatId;
  readonly rules: MatchRules;
  readonly venueId: VenueId | null;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
}

export function fixtureRules(snapshot: TournamentSnapshot, fixture: Fixture, override?: MatchRules): MatchRules {
  const stage = snapshot.stages.find((entry) => entry.id === fixture.stageId);
  const rules = override ?? fixture.matchRules ?? stage?.config.matchRules ?? snapshot.rules.defaultMatchRules;
  if (stage?.config.knockout?.tiedMatch === 'super_over' && !rules.superOver.enabled) {
    return { ...rules, superOver: { ...rules.superOver, enabled: true } };
  }
  return rules;
}

export function fixtureMatchDefaults(snapshot: TournamentSnapshot, evaluation: TournamentEvaluation, fixture: Fixture): FixtureMatchDefaults | null {
  const teams = resolveFixtureTeams(evaluation, fixture);
  if (teams.a === null || teams.b === null) {
    return null;
  }
  const stage = snapshot.stages.find((entry) => entry.id === fixture.stageId);
  const name = (teamId: TeamId) => snapshot.teams.find((view) => view.team.id === teamId)?.team.name ?? 'Team';
  return {
    title: `${name(teams.a)} v ${name(teams.b)}`,
    teamAId: teams.a,
    teamBId: teams.b,
    formatId: fixture.formatId ?? stage?.config.formatId ?? snapshot.rules.defaultFormatId,
    rules: fixtureRules(snapshot, fixture),
    venueId: fixture.venueId,
    scheduledDate: fixture.scheduledDate,
    scheduledTime: fixture.scheduledTime,
  };
}

function assertStartable(snapshot: TournamentSnapshot, fixture: Fixture): void {
  const status = snapshot.tournament.status;
  if (status === 'completed') {
    throw failure('FORBIDDEN_STATE', 'This tournament is completed. Reopen it before playing more matches.');
  }
  if (status !== 'fixtures_generated' && status !== 'active') {
    throw failure('FORBIDDEN_STATE', "Confirm the tournament's fixtures first.");
  }
  if (fixture.matchId !== null) {
    throw failure('FORBIDDEN_STATE', "This fixture's match has already been started.");
  }
  if (fixture.status === 'postponed') {
    throw failure('FORBIDDEN_STATE', 'Reschedule this fixture first.');
  }
  if (fixture.status === 'cancelled') {
    throw failure('FORBIDDEN_STATE', 'This fixture is cancelled. Restore it before starting its match.');
  }
  if (fixture.status !== 'scheduled' && fixture.status !== 'rescheduled') {
    throw failure('FORBIDDEN_STATE', "This fixture can't be started again.");
  }
}

export function createFixtureMatchOperations(ctx: ServiceContext): FixtureMatchOperations {
  return {
    startFixtureMatch(fixtureId, setup, openingEvents = []) {
      return attempt(MESSAGES.createMatch, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, fixture } = await snapshotOfFixture(ctx, repos, fixtureId);
          assertTournamentWritable(snapshot);
          assertStartable(snapshot, fixture);
          const { evaluation } = evaluateSnapshot(snapshot);
          const defaults = fixtureMatchDefaults(snapshot, evaluation, fixture);
          if (defaults === null) {
            throw failure('FORBIDDEN_STATE', "The teams for this fixture aren't decided yet.");
          }
          const withdrawn = [defaults.teamAId, defaults.teamBId].find(
            (teamId) => snapshot.teams.find((view) => view.team.id === teamId)?.membership.status !== 'active',
          );
          if (withdrawn !== undefined) {
            throw failure('FORBIDDEN_STATE', 'One of these teams is no longer in the tournament.');
          }
          const input: NewMatchInput = {
            title: defaults.title,
            teamAId: defaults.teamAId,
            teamBId: defaults.teamBId,
            venueId: defaults.venueId,
            scheduledDate: defaults.scheduledDate,
            scheduledTime: defaults.scheduledTime,
            formatId: defaults.formatId,
            rules: fixtureRules(snapshot, fixture, setup.rules),
            squads: setup.squads,
            toss: setup.toss,
            tournamentId: snapshot.tournament.id,
            fixtureId,
            teamAPlayers: setup.teamAPlayers ?? null,
            teamBPlayers: setup.teamBPlayers ?? null,
          };
          validateNewMatch(input);
          await assertSquadSizes(repos, input);
          const now = ctx.clock.now();
          const match = await newMatchRow(repos, input, ctx.ids(), now);
          await repos.matches.insert(match, input.squads);
          await repos.tournaments.updateFixture({ ...fixture, matchId: match.id, updatedAt: now });
          const committed = await startLog(ctx, repos, match, openingEvents, now);
          if (committed.tournament === null) {
            await applyMatchEffects(ctx, repos, {
              tournamentId: snapshot.tournament.id,
              matchId: match.id,
              fixtureId,
              matchStatus: committed.live.match.status,
              summaryChanged: true,
              now,
            });
          }
          await writeAudit(
            ctx,
            repos,
            {
              tournamentId: snapshot.tournament.id,
              matchId: match.id,
              action: 'match_started',
              entityType: 'match',
              entityId: match.id,
              summary: `Match ${fixture.matchNumber}: ${match.title} started.`,
              newValue: { fixtureId, teamAId: match.teamAId, teamBId: match.teamBId },
            },
            now,
          );
          return committed.live.match;
        }),
      );
    },
  };
}

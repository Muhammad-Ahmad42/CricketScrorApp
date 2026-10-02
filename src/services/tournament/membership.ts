import type { FixtureSide, TeamId, TournamentSnapshot, TournamentTeam } from '@/domain/types';
import type { Repositories } from '@/db';
import type { TournamentService } from '../contracts';
import { writeAudit } from '../core/audit';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction } from '../core/transaction';
import { readEvaluated, readSnapshot } from './snapshots';

type MembershipOperations = Pick<TournamentService, 'addTeams' | 'removeTeams'>;

function isTeam(side: FixtureSide, teamId: TeamId): boolean {
  return side.kind === 'team' && side.teamId === teamId;
}

function assertSeed(seed: number | null): void {
  if (seed !== null && (!Number.isInteger(seed) || seed < 1)) {
    throw failure('VALIDATION', 'Seeds are whole numbers starting at 1.');
  }
}

async function teamName(repos: Repositories, teamId: TeamId): Promise<string> {
  const team = await repos.teams.get(teamId);
  if (team === null) {
    throw failure('NOT_FOUND', 'One of the teams no longer exists.');
  }
  return team.name;
}

function membershipOf(snapshot: TournamentSnapshot, teamId: TeamId): TournamentTeam | null {
  return snapshot.teams.find((view) => view.membership.teamId === teamId)?.membership ?? null;
}

export function createMembershipOperations(ctx: ServiceContext): MembershipOperations {
  return {
    addTeams(tournamentId, teams) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, policy } = await readEvaluated(ctx, repos, tournamentId);
          if (policy.addTeams === 'forbidden') {
            throw failure('FORBIDDEN_STATE', "Teams can't be added to this tournament any more.");
          }
          if (policy.addTeams === 'confirm') {
            throw failure('CONFIRMATION_REQUIRED', 'Results already exist. Replace a team instead, so the change can be previewed first.');
          }
          const ids = teams.map((entry) => entry.teamId);
          if (new Set(ids).size !== ids.length) {
            throw failure('VALIDATION', 'Each team can only be added once.');
          }
          const now = ctx.clock.now();
          const rows: TournamentTeam[] = [];
          for (const entry of teams) {
            assertSeed(entry.seed);
            const name = await teamName(repos, entry.teamId);
            if (membershipOf(snapshot, entry.teamId) !== null) {
              throw failure('VALIDATION', `${name} are already in this tournament.`);
            }
            rows.push({
              id: ctx.ids(),
              tournamentId,
              teamId: entry.teamId,
              seed: entry.seed,
              status: 'active',
              replacedByTeamId: null,
              inheritsFromTeamId: null,
              joinedAt: now,
            });
            await writeAudit(
              ctx,
              repos,
              {
                tournamentId,
                action: 'team_added',
                entityType: 'team',
                entityId: entry.teamId,
                summary: `${name} joined the tournament${entry.seed === null ? '' : ` as seed ${entry.seed}`}.`,
                newValue: { teamId: entry.teamId, seed: entry.seed },
              },
              now,
            );
          }
          await repos.tournaments.upsertTournamentTeams(rows);
          await repos.tournaments.bumpRevision(tournamentId);
          return readSnapshot(ctx, repos, tournamentId);
        }),
      );
    },

    removeTeams(tournamentId, teamIds) {
      return attempt(MESSAGES.tournament, () =>
        inTransaction(ctx, async (repos) => {
          const { snapshot, policy } = await readEvaluated(ctx, repos, tournamentId);
          if (policy.removeTeams === 'forbidden') {
            throw failure('FORBIDDEN_STATE', "Teams can't be removed from this tournament any more.");
          }
          const now = ctx.clock.now();
          const removed = new Set(teamIds);
          const isRemoved = (side: FixtureSide) => side.kind === 'team' && removed.has(side.teamId);
          for (const stage of snapshot.stages) {
            const entries = snapshot.poolEntries.filter((entry) => entry.stageId === stage.id);
            if (entries.some((entry) => isRemoved(entry.side))) {
              await repos.tournaments.replacePoolEntries(
                stage.id,
                entries.filter((entry) => !isRemoved(entry.side)),
              );
            }
          }
          for (const teamId of teamIds) {
            const membership = membershipOf(snapshot, teamId);
            if (membership === null) {
              throw failure('NOT_FOUND', 'This team is not in the tournament.');
            }
            const name = await teamName(repos, teamId);
            if (snapshot.fixtures.some((fixture) => isTeam(fixture.sideA, teamId) || isTeam(fixture.sideB, teamId))) {
              throw failure('FORBIDDEN_STATE', `${name} already have fixtures. Withdraw the team instead, so their results are handled.`);
            }
            await repos.tournaments.deleteTournamentTeam(membership.id);
            await writeAudit(
              ctx,
              repos,
              {
                tournamentId,
                action: 'team_removed',
                entityType: 'team',
                entityId: teamId,
                summary: `${name} were removed from the tournament.`,
                previousValue: { teamId, seed: membership.seed },
              },
              now,
            );
          }
          await repos.tournaments.bumpRevision(tournamentId);
          return readSnapshot(ctx, repos, tournamentId);
        }),
      );
    },
  };
}

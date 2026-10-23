import type { NewPlayerInput, NewTeamInput, Player, Team, TeamId, Venue } from '@/domain/types';
import type { Repositories } from '@/db';
import type { TeamService } from '../contracts';
import type { ServiceContext } from '../core/context';
import { MESSAGES } from '../core/errors';
import { failure } from '../core/result';
import { attempt, inTransaction, withRepositories } from '../core/transaction';
import { trimmedOrNull } from '../core/values';

const TEAM_NOT_FOUND = 'This team no longer exists.';
const PLAYER_NOT_FOUND = 'This player no longer exists.';

function teamName(name: string): string {
  const trimmed = trimmedOrNull(name);
  if (trimmed === null) {
    throw failure('VALIDATION', 'Enter the team name.');
  }
  return trimmed;
}

function shortName(value: string, name: string): string {
  const trimmed = trimmedOrNull(value) ?? name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  if (trimmed.length === 0 || trimmed.length > 6) {
    throw failure('VALIDATION', 'Use a short name of up to 6 characters.');
  }
  return trimmed;
}

function jersey(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > 999) {
    throw failure('VALIDATION', 'Use a shirt number between 0 and 999.');
  }
  return value;
}

function newPlayer(ctx: ServiceContext, teamId: TeamId, input: NewPlayerInput, now: string): Player {
  const name = trimmedOrNull(input.name);
  if (name === null) {
    throw failure('VALIDATION', "Enter the player's name.");
  }
  return {
    id: ctx.ids(),
    teamId,
    name,
    jerseyNumber: jersey(input.jerseyNumber),
    role: input.role ?? 'unknown',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

async function requireTeam(repos: Repositories, teamId: TeamId): Promise<Team> {
  const team = await repos.teams.get(teamId);
  if (team === null) {
    throw failure('NOT_FOUND', TEAM_NOT_FOUND);
  }
  return team;
}

async function requirePlayer(repos: Repositories, playerId: string): Promise<Player> {
  const [player] = await repos.players.getMany([playerId]);
  if (player === undefined) {
    throw failure('NOT_FOUND', PLAYER_NOT_FOUND);
  }
  return player;
}

export function createTeamService(ctx: ServiceContext): TeamService {
  return {
    list(opts) {
      return attempt(MESSAGES.team, () => withRepositories(ctx, (repos) => repos.teams.list(opts)));
    },

    playerCounts() {
      return attempt(MESSAGES.team, () => withRepositories(ctx, (repos) => repos.players.countActiveByTeam()));
    },

    get(teamId) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const team = await requireTeam(repos, teamId);
          return { team, players: await repos.players.listByTeam(teamId) };
        }),
      );
    },

    create(input: NewTeamInput) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const name = teamName(input.name);
          const now = ctx.clock.now();
          const team: Team = {
            id: ctx.ids(),
            name,
            shortName: shortName(input.shortName, name),
            logoUri: input.logoUri ?? null,
            captainId: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
          };
          const players = input.players.map((player) => newPlayer(ctx, team.id, player, now));
          const captainIndex = input.captainIndex ?? null;
          if (captainIndex !== null && (captainIndex < 0 || captainIndex >= players.length)) {
            throw failure('VALIDATION', 'Choose the captain from the players of this team.');
          }
          await repos.teams.insert(team);
          for (const player of players) {
            await repos.players.insert(player);
          }
          const created = captainIndex === null ? team : { ...team, captainId: players[captainIndex].id };
          if (created !== team) {
            await repos.teams.update(created);
          }
          return created;
        }),
      );
    },

    update(team) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          await requireTeam(repos, team.id);
          const name = teamName(team.name);
          const next: Team = { ...team, name, shortName: shortName(team.shortName, name), updatedAt: ctx.clock.now() };
          await repos.teams.update(next);
          return next;
        }),
      );
    },

    archive(teamId) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const team = await requireTeam(repos, teamId);
          const now = ctx.clock.now();
          await repos.teams.update({ ...team, archivedAt: team.archivedAt ?? now, updatedAt: now });
        }),
      );
    },

    addPlayer(teamId, input) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          await requireTeam(repos, teamId);
          const player = newPlayer(ctx, teamId, input, ctx.clock.now());
          await repos.players.insert(player);
          return player;
        }),
      );
    },

    updatePlayer(player) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          await requirePlayer(repos, player.id);
          const name = trimmedOrNull(player.name);
          if (name === null) {
            throw failure('VALIDATION', "Enter the player's name.");
          }
          const next: Player = { ...player, name, jerseyNumber: jersey(player.jerseyNumber), updatedAt: ctx.clock.now() };
          await repos.players.update(next);
          return next;
        }),
      );
    },

    archivePlayer(playerId) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const player = await requirePlayer(repos, playerId);
          const now = ctx.clock.now();
          await repos.players.update({ ...player, archivedAt: player.archivedAt ?? now, updatedAt: now });
        }),
      );
    },

    listVenues() {
      return attempt(MESSAGES.team, () => withRepositories(ctx, (repos) => repos.venues.list()));
    },

    createVenue(input) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const name = trimmedOrNull(input.name);
          if (name === null) {
            throw failure('VALIDATION', 'Enter the venue name.');
          }
          const now = ctx.clock.now();
          const venue: Venue = {
            id: ctx.ids(),
            name,
            location: trimmedOrNull(input.location),
            notes: null,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
          };
          await repos.venues.insert(venue);
          return venue;
        }),
      );
    },

    archiveVenue(venueId) {
      return attempt(MESSAGES.team, () =>
        inTransaction(ctx, async (repos) => {
          const venue = await repos.venues.get(venueId);
          if (venue === null) {
            throw failure('NOT_FOUND', 'This venue no longer exists.');
          }
          await repos.venues.archive(venueId, ctx.clock.now());
        }),
      );
    },
  };
}

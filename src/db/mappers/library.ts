import type { Player, PlayerRole, Team, Venue } from '@/domain/types';
import type { SqlRecord } from './values';

export interface TeamRow {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly logo_uri: string | null;
  readonly captain_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
}

export interface PlayerRow {
  readonly id: string;
  readonly team_id: string;
  readonly name: string;
  readonly jersey_number: number | null;
  readonly role: PlayerRole;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
}

export interface VenueRow {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly archived_at: string | null;
}

export const TEAM_COLUMNS = 'id, name, short_name, logo_uri, captain_id, created_at, updated_at, archived_at';
export const PLAYER_COLUMNS = 'id, team_id, name, jersey_number, role, created_at, updated_at, archived_at';
export const VENUE_COLUMNS = 'id, name, location, notes, created_at, updated_at, archived_at';

export function teamFromRow(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    logoUri: row.logo_uri,
    captainId: row.captain_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function teamToRecord(team: Team): SqlRecord {
  return {
    id: team.id,
    name: team.name,
    short_name: team.shortName,
    logo_uri: team.logoUri,
    captain_id: team.captainId,
    created_at: team.createdAt,
    updated_at: team.updatedAt,
    archived_at: team.archivedAt,
  };
}

export function playerFromRow(row: PlayerRow): Player {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    jerseyNumber: row.jersey_number,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function playerToRecord(player: Player): SqlRecord {
  return {
    id: player.id,
    team_id: player.teamId,
    name: player.name,
    jersey_number: player.jerseyNumber,
    role: player.role,
    created_at: player.createdAt,
    updated_at: player.updatedAt,
    archived_at: player.archivedAt,
  };
}

export function venueFromRow(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export function venueToRecord(venue: Venue): SqlRecord {
  return {
    id: venue.id,
    name: venue.name,
    location: venue.location,
    notes: venue.notes,
    created_at: venue.createdAt,
    updated_at: venue.updatedAt,
    archived_at: venue.archivedAt,
  };
}

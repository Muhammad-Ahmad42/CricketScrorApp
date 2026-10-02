import type { IsoDateTime, PlayerId, TeamId, VenueId } from './primitives';

export const PLAYER_ROLES = ['batter', 'bowler', 'all_rounder', 'wicket_keeper', 'unknown'] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];

export interface Team {
  readonly id: TeamId;
  readonly name: string;
  readonly shortName: string;
  readonly logoUri: string | null;
  readonly captainId: PlayerId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly archivedAt: IsoDateTime | null;
}

export interface Player {
  readonly id: PlayerId;
  readonly teamId: TeamId;
  readonly name: string;
  readonly jerseyNumber: number | null;
  readonly role: PlayerRole;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly archivedAt: IsoDateTime | null;
}

export interface Venue {
  readonly id: VenueId;
  readonly name: string;
  readonly location: string | null;
  readonly notes: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly archivedAt: IsoDateTime | null;
}

export interface TeamRef {
  readonly id: TeamId;
  readonly name: string;
  readonly shortName: string;
}

export interface NewTeamInput {
  readonly name: string;
  readonly shortName: string;
  readonly logoUri?: string | null;
  readonly players: readonly NewPlayerInput[];
  readonly captainIndex?: number | null;
}

export interface NewPlayerInput {
  readonly name: string;
  readonly jerseyNumber?: number | null;
  readonly role?: PlayerRole;
}

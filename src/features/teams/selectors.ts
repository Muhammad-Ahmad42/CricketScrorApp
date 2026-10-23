import { PLAYER_ROLES, type Player, type PlayerRole, type Team } from '@/domain/types';

export const ROLE_LABEL: { readonly [K in PlayerRole]: string } = {
  batter: 'Batter',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Keeper',
  unknown: 'Not set',
};

export const ROLE_OPTIONS: readonly { readonly value: PlayerRole; readonly label: string }[] = PLAYER_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

export function playerCountText(count: number | undefined): string | undefined {
  if (count === undefined) {
    return undefined;
  }
  if (count === 0) {
    return 'No players yet';
  }
  return count === 1 ? '1 player' : `${count} players`;
}

export function teamRowSubtitle(team: Team, count: number | undefined): string | undefined {
  const players = playerCountText(count);
  if (team.archivedAt !== null) {
    return players === undefined ? 'Archived' : `Archived · ${players}`;
  }
  return players;
}

export function suggestShortName(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (letters === '') {
    return '';
  }
  const first = letters.split(/\s+/)[0];
  return first.slice(0, 3).toUpperCase();
}

export const SHORT_NAME_MIN = 2;
export const SHORT_NAME_MAX = 4;
export const SHORT_NAME_HELPER = `${SHORT_NAME_MIN}–${SHORT_NAME_MAX} letters`;

export function shortNameError(shortName: string): string | null {
  const value = shortName.trim();
  if (value.length < SHORT_NAME_MIN || value.length > SHORT_NAME_MAX) {
    return `Use ${SHORT_NAME_MIN} to ${SHORT_NAME_MAX} letters`;
  }
  return null;
}

export interface PlayerRowVM {
  readonly id: string;
  readonly jersey: string;
  readonly name: string;
  readonly role: string | null;
  readonly subtitle: string | undefined;
  readonly captain: boolean;
  readonly archived: boolean;
  readonly accessibilityLabel: string;
}

export function selectPlayerRows(team: Team, players: readonly Player[]): readonly PlayerRowVM[] {
  return [...players]
    .sort((a, b) => Number(a.archivedAt !== null) - Number(b.archivedAt !== null) || a.name.localeCompare(b.name))
    .map((player) => {
      const captain = team.captainId === player.id;
      const archived = player.archivedAt !== null;
      const jersey = player.jerseyNumber === null ? '' : `#${player.jerseyNumber}`;
      const role = player.role === 'unknown' ? null : ROLE_LABEL[player.role];
      const subtitle = [role, archived ? 'Archived' : null].filter((part): part is string => part !== null).join(' · ');
      return {
        id: player.id,
        jersey,
        name: player.name,
        role,
        subtitle: subtitle === '' ? undefined : subtitle,
        captain,
        archived,
        accessibilityLabel: [jersey, player.name, role, captain ? 'captain' : null, archived ? 'archived' : null]
          .filter((part): part is string => part !== null && part !== '')
          .join(', '),
      };
    });
}

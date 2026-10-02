import { PLAYER_ROLES, type Player, type PlayerRole, type Team } from '@/domain/types';

export const ROLE_LABEL: { readonly [K in PlayerRole]: string } = {
  batter: 'Batter',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Keeper',
  unknown: 'Not set',
};

export const ROLE_OPTIONS: readonly { readonly value: PlayerRole; readonly label: string }[] = PLAYER_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

export function suggestShortName(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (letters === '') {
    return '';
  }
  const first = letters.split(/\s+/)[0];
  return first.slice(0, 3).toUpperCase();
}

export function shortNameError(shortName: string): string | null {
  const value = shortName.trim();
  if (value.length < 2 || value.length > 4) {
    return 'Use 2 to 4 letters';
  }
  return null;
}

export interface PlayerRowVM {
  readonly id: string;
  readonly jersey: string;
  readonly name: string;
  readonly role: string;
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
      return {
        id: player.id,
        jersey,
        name: player.name,
        role: ROLE_LABEL[player.role],
        captain,
        archived,
        accessibilityLabel: [jersey, player.name, ROLE_LABEL[player.role], captain ? 'captain' : null, archived ? 'archived' : null]
          .filter((part): part is string => part !== null && part !== '')
          .join(', '),
      };
    });
}

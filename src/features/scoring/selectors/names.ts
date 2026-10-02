import type { MatchPlayer, MatchSetup, MatchTeam, PlayerId, TeamId } from '@/domain/types';

export const UNKNOWN_PLAYER = 'Unknown player';

export function playerOf(setup: MatchSetup, playerId: PlayerId | null | undefined): MatchPlayer | null {
  if (playerId === null || playerId === undefined) {
    return null;
  }
  return setup.players.find((player) => player.playerId === playerId) ?? null;
}

export function playerName(setup: MatchSetup, playerId: PlayerId | null | undefined): string {
  return playerOf(setup, playerId)?.name ?? UNKNOWN_PLAYER;
}

export function teamOf(setup: MatchSetup, teamId: TeamId | null | undefined): MatchTeam | null {
  return setup.teams.find((team) => team.id === teamId) ?? null;
}

export function teamName(setup: MatchSetup, teamId: TeamId | null | undefined): string {
  return teamOf(setup, teamId)?.name ?? 'Unknown team';
}

export function teamShortName(setup: MatchSetup, teamId: TeamId | null | undefined): string {
  return teamOf(setup, teamId)?.shortName ?? '?';
}

export function otherTeam(setup: MatchSetup, teamId: TeamId): MatchTeam {
  return setup.teams[0].id === teamId ? setup.teams[1] : setup.teams[0];
}

export function squadOf(setup: MatchSetup, teamId: TeamId, opts: { readonly substitutes?: boolean } = {}): readonly MatchPlayer[] {
  const members = setup.players.filter((player) => player.teamId === teamId && (opts.substitutes === true || !player.isSubstitute));
  return [...members].sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name));
}

function orderOf(player: MatchPlayer): number {
  return player.battingOrder ?? Number.MAX_SAFE_INTEGER;
}

export function ordinal(value: number): string {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function firstName(name: string): string {
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  return space > 0 ? trimmed.slice(0, space) : trimmed;
}

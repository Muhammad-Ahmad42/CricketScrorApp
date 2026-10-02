import type { MatchPlayer, MatchSetup, MatchTeam, PlayerId, TeamId } from '../../types';

export function findPlayer(setup: MatchSetup, playerId: PlayerId): MatchPlayer | undefined {
  return setup.players.find((player) => player.playerId === playerId);
}

export function playerName(setup: MatchSetup, playerId: PlayerId | null): string {
  if (playerId === null) {
    return 'Unknown';
  }
  return findPlayer(setup, playerId)?.name ?? 'Unknown';
}

export function findTeam(setup: MatchSetup, teamId: TeamId): MatchTeam | undefined {
  return setup.teams.find((team) => team.id === teamId);
}

export function isTeamInMatch(setup: MatchSetup, teamId: unknown): teamId is TeamId {
  return typeof teamId === 'string' && setup.teams.some((team) => team.id === teamId);
}

export function teamName(setup: MatchSetup, teamId: TeamId): string {
  return findTeam(setup, teamId)?.name ?? 'Unknown team';
}

export function otherTeamId(setup: MatchSetup, teamId: TeamId): TeamId {
  return setup.teams[0].id === teamId ? setup.teams[1].id : setup.teams[0].id;
}

export function playersInSide(setup: MatchSetup, teamId: TeamId): number {
  return findTeam(setup, teamId)?.playersInSide ?? setup.rules.playersPerSide;
}

export function allOutThreshold(setup: MatchSetup, teamId: TeamId): number {
  const size = playersInSide(setup, teamId);
  return setup.rules.lastManStands ? size : size - 1;
}

function compareSquadOrder(a: MatchPlayer, b: MatchPlayer): number {
  const orderA = a.battingOrder ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.battingOrder ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1;
  }
  if (a.playerId !== b.playerId) {
    return a.playerId < b.playerId ? -1 : 1;
  }
  return 0;
}

export function battingSquad(setup: MatchSetup, teamId: TeamId): readonly MatchPlayer[] {
  return setup.players.filter((player) => player.teamId === teamId && !player.isSubstitute).sort(compareSquadOrder);
}

export function squadIndex(setup: MatchSetup, teamId: TeamId): ReadonlyMap<PlayerId, number> {
  return new Map(battingSquad(setup, teamId).map((player, index) => [player.playerId, index]));
}

export function isFieldingPlayer(setup: MatchSetup, fieldingTeamId: TeamId, playerId: unknown): boolean {
  return (
    typeof playerId === 'string' &&
    setup.players.some((player) => player.playerId === playerId && player.teamId === fieldingTeamId)
  );
}

export function designatedKeeper(setup: MatchSetup, fieldingTeamId: TeamId): PlayerId | null {
  const keepers = setup.players.filter((player) => player.teamId === fieldingTeamId && player.isWicketKeeper);
  const regular = keepers.find((player) => !player.isSubstitute);
  return (regular ?? keepers[0])?.playerId ?? null;
}

export type SquadCheck = 'ok' | 'not_in_squad' | 'wrong_side' | 'substitute';

export function checkSquadMember(setup: MatchSetup, teamId: TeamId, playerId: unknown, allowSubstitute = false): SquadCheck {
  if (typeof playerId !== 'string') {
    return 'not_in_squad';
  }
  const player = findPlayer(setup, playerId);
  if (player === undefined) {
    return 'not_in_squad';
  }
  if (player.teamId !== teamId) {
    return 'wrong_side';
  }
  if (player.isSubstitute && !allowSubstitute) {
    return 'substitute';
  }
  return 'ok';
}

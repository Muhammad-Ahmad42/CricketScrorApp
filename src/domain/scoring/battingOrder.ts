import type { TeamId, Toss } from '../types';

export interface MatchSides {
  readonly teamAId: TeamId;
  readonly teamBId: TeamId;
}

export function tossBattingTeam(sides: MatchSides, toss: Toss): TeamId | null {
  if (toss.winnerTeamId !== sides.teamAId && toss.winnerTeamId !== sides.teamBId) {
    return null;
  }
  if (toss.decision === 'bat') {
    return toss.winnerTeamId;
  }
  return toss.winnerTeamId === sides.teamAId ? sides.teamBId : sides.teamAId;
}

export function openingBattingTeam(sides: MatchSides, toss: Toss | null, chosen: TeamId | null): TeamId | null {
  if (toss !== null) {
    return tossBattingTeam(sides, toss);
  }
  return chosen === sides.teamAId || chosen === sides.teamBId ? chosen : null;
}

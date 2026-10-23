import type { MatchRules, PlayerId, TeamId } from '../types';

export const MIN_SQUAD_PLAYERS = 2;

export type SquadSizeIssueCode = 'SQUAD_TOO_LARGE' | 'SQUAD_TOO_SMALL' | 'SQUAD_BELOW_MINIMUM';

export interface SquadSizeIssue {
  readonly severity: 'error' | 'warning';
  readonly code: SquadSizeIssueCode;
  readonly teamId: TeamId;
  readonly teamName: string;
  readonly selected: number;
  readonly sideSize: number;
  readonly message: string;
  readonly headline?: string;
  readonly detail?: string;
}

export interface SquadSizeSide {
  readonly teamId: TeamId;
  readonly teamName: string;
  readonly selected: number;
  readonly sideSize: number | null;
}

export interface SquadSizeDraft {
  readonly rules: Pick<MatchRules, 'playersPerSide'>;
  readonly teamAId: TeamId | null;
  readonly teamBId: TeamId | null;
  readonly teamAPlayers: number | null;
  readonly teamBPlayers: number | null;
  readonly squadA: readonly PlayerId[];
  readonly squadB: readonly PlayerId[];
  readonly substitutesA: readonly PlayerId[];
  readonly substitutesB: readonly PlayerId[];
}

function players(count: number): string {
  return `${count} ${count === 1 ? 'player' : 'players'}`;
}

function sideIssue(rules: Pick<MatchRules, 'playersPerSide'>, side: SquadSizeSide): SquadSizeIssue | null {
  const sideSize = side.sideSize ?? rules.playersPerSide;
  const base = { teamId: side.teamId, teamName: side.teamName, selected: side.selected, sideSize };
  if (side.selected > sideSize) {
    const extra = side.selected - sideSize;
    const headline = `${side.teamName}: ${players(extra)} too many`;
    const detail = `This match is ${sideSize} a side. Remove ${extra} or make ${extra === 1 ? 'them a substitute' : 'them substitutes'}.`;
    return { ...base, severity: 'error', code: 'SQUAD_TOO_LARGE', message: `${headline}. ${detail}`, headline, detail };
  }
  if (side.selected < MIN_SQUAD_PLAYERS) {
    const headline = `Choose at least ${MIN_SQUAD_PLAYERS} players for ${side.teamName}`;
    return { ...base, severity: 'error', code: 'SQUAD_BELOW_MINIMUM', message: `${headline}.`, headline };
  }
  if (side.selected < sideSize) {
    const headline = `${side.teamName}: ${side.selected} of ${sideSize} players`;
    const detail = 'The innings ends when only one batter is left.';
    return { ...base, severity: 'warning', code: 'SQUAD_TOO_SMALL', message: `${headline}. ${detail}`, headline, detail };
  }
  return null;
}

export function checkSquadSizes(rules: Pick<MatchRules, 'playersPerSide'>, sides: readonly SquadSizeSide[]): readonly SquadSizeIssue[] {
  return sides.map((side) => sideIssue(rules, side)).filter((issue): issue is SquadSizeIssue => issue !== null);
}

function playing(squad: readonly PlayerId[], substitutes: readonly PlayerId[]): number {
  return squad.filter((playerId) => !substitutes.includes(playerId)).length;
}

export function checkDraftSquadSizes(draft: SquadSizeDraft, teamName: (teamId: TeamId) => string): readonly SquadSizeIssue[] {
  const sides: SquadSizeSide[] = [];
  if (draft.teamAId !== null) {
    sides.push({ teamId: draft.teamAId, teamName: teamName(draft.teamAId), selected: playing(draft.squadA, draft.substitutesA), sideSize: draft.teamAPlayers });
  }
  if (draft.teamBId !== null) {
    sides.push({ teamId: draft.teamBId, teamName: teamName(draft.teamBId), selected: playing(draft.squadB, draft.substitutesB), sideSize: draft.teamBPlayers });
  }
  return checkSquadSizes(draft.rules, sides);
}

export function blockingSquadIssue(issues: readonly SquadSizeIssue[]): SquadSizeIssue | null {
  return issues.find((issue) => issue.severity === 'error') ?? null;
}

import type { Player, PlayerId, TeamId } from '@/domain/types';
import type { MatchSetupDraft } from '@/stores/contracts';
import { openingBattingTeam } from '@/domain/scoring/battingOrder';
import { BUILTIN_FORMAT_PRESETS, getBuiltinPreset, OVERS_QUICK_PICKS } from '@/domain/scoring/presets';
import { hasBlockingIssue, rulesIssues } from './rules';

export type WizardStep = 'index' | 'teams' | 'players' | 'toss' | 'openers';

export const STEPS: readonly WizardStep[] = ['index', 'teams', 'players', 'toss', 'openers'];

export const STEP_TITLE: { readonly [K in WizardStep]: string } = {
  index: 'New match',
  teams: 'Teams',
  players: 'Players',
  toss: 'Toss',
  openers: 'Openers',
};

export const STEP_ROUTE: { readonly [K in WizardStep]: '/match/new' | '/match/new/teams' | '/match/new/players' | '/match/new/toss' | '/match/new/openers' } = {
  index: '/match/new',
  teams: '/match/new/teams',
  players: '/match/new/players',
  toss: '/match/new/toss',
  openers: '/match/new/openers',
};

export interface FormatChip {
  readonly id: string;
  readonly label: string;
}

export const FORMAT_CHIPS: readonly FormatChip[] = [...BUILTIN_FORMAT_PRESETS.map((preset) => ({ id: `${preset.id}`, label: preset.label })), { id: 'custom', label: 'Custom' }];

export const QUICK_OVERS: readonly number[] = OVERS_QUICK_PICKS;

export function formatTitle(draft: MatchSetupDraft): string {
  const preset = getBuiltinPreset(draft.formatId);
  if (preset === null) {
    return 'Custom';
  }
  return JSON.stringify(preset.rules) === JSON.stringify(draft.rules) ? preset.label : `${preset.label} (edited)`;
}

export function oversError(overs: number | null): string | null {
  return overs === null || !Number.isInteger(overs) || overs < 1 || overs > 999 ? 'Enter the number of overs (1 or more)' : null;
}

export function canLeaveInfo(draft: MatchSetupDraft): boolean {
  return oversError(draft.rules.oversPerInnings) === null && !hasBlockingIssue(rulesIssues(draft.rules));
}

export function canLeaveTeams(draft: MatchSetupDraft): boolean {
  return draft.teamAId !== null && draft.teamBId !== null && draft.teamAId !== draft.teamBId;
}

export function canLeavePlayers(draft: MatchSetupDraft): boolean {
  return draft.squadA.length >= 2 && draft.squadB.length >= 2;
}

export type Side = 'A' | 'B';

export function sideOf(draft: MatchSetupDraft, teamId: TeamId): Side {
  return draft.teamAId === teamId ? 'A' : 'B';
}

export function squadOf(draft: MatchSetupDraft, side: Side): readonly PlayerId[] {
  return side === 'A' ? draft.squadA : draft.squadB;
}

export function substitutesOf(draft: MatchSetupDraft, side: Side): readonly PlayerId[] {
  return side === 'A' ? draft.substitutesA : draft.substitutesB;
}

export function sideSize(draft: MatchSetupDraft, side: Side): number {
  return (side === 'A' ? draft.teamAPlayers : draft.teamBPlayers) ?? draft.rules.playersPerSide;
}

export function squadPatch(side: Side, squad: readonly PlayerId[], substitutes: readonly PlayerId[]): Partial<MatchSetupDraft> {
  return side === 'A' ? { squadA: squad, substitutesA: substitutes } : { squadB: squad, substitutesB: substitutes };
}

export function toggled(list: readonly PlayerId[], playerId: PlayerId): readonly PlayerId[] {
  return list.includes(playerId) ? list.filter((id) => id !== playerId) : [...list, playerId];
}

export function moved(list: readonly PlayerId[], playerId: PlayerId, direction: -1 | 1): readonly PlayerId[] {
  const index = list.indexOf(playerId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) {
    return list;
  }
  const next = [...list];
  next[index] = list[target];
  next[target] = playerId;
  return next;
}

export function battingFirstOf(draft: MatchSetupDraft): TeamId | null {
  if (draft.teamAId === null || draft.teamBId === null) {
    return null;
  }
  return openingBattingTeam({ teamAId: draft.teamAId, teamBId: draft.teamBId }, draft.toss, draft.battingFirstTeamId ?? null);
}

export const NO_OPENERS: MatchSetupDraft['openers'] = { strikerId: null, nonStrikerId: null, bowlerId: null };

export function battingOrderPatch(draft: MatchSetupDraft, patch: Pick<Partial<MatchSetupDraft>, 'toss' | 'battingFirstTeamId'>): Partial<MatchSetupDraft> {
  const next = { ...draft, ...patch };
  return battingFirstOf(next) === battingFirstOf(draft) ? patch : { ...patch, openers: NO_OPENERS };
}

export function namedPlayers(ids: readonly PlayerId[], players: readonly Player[] | null): readonly Player[] {
  if (players === null) {
    return [];
  }
  return ids.map((id) => players.find((player) => player.id === id)).filter((player): player is Player => player !== undefined);
}

export function draftIsEmpty(draft: MatchSetupDraft): boolean {
  return draft.title === '' && draft.teamAId === null && draft.teamBId === null && draft.squadA.length === 0 && draft.squadB.length === 0;
}

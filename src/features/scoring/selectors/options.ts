import type { DeliveryCall, DeliveryDismissalType, InningsState, MatchSetup, MatchState, PendingAction, PlayerId, TeamId } from '@/domain/types';
import { currentInnings } from '@/domain/scoring/replay';
import { formatBowlingFigures, formatOvers, formatRequirement, formatRequirementCompact, formatScore } from '@/domain/scoring/format';
import { nextInningsPreview } from '@/domain/scoring/nextInnings';
import { allowedDismissals, bowlerEligibility, eligibleIncomingBatters } from '@/domain/scoring/validate';
import { COMPLETION_TEXT, ineligibilityText, inningsTitle, regularNumberOf, SUSPENSION_TEXT } from './labels';
import { otherTeam, playerName, playerOf, squadOf, teamName } from './names';
import { plural } from '@/features/shared/text';

export interface PlayerOption {
  readonly id: PlayerId;
  readonly label: string;
  readonly detail: string | null;
  readonly tag: string | null;
  readonly isSubstitute: boolean;
}

export function playerOption(setup: MatchSetup, playerId: PlayerId, detail: string | null = null, tag: string | null = null): PlayerOption {
  const player = playerOf(setup, playerId);
  return {
    id: playerId,
    label: player?.name ?? playerName(setup, playerId),
    detail,
    tag: tag ?? (player?.isSubstitute === true ? 'sub' : null),
    isSubstitute: player?.isSubstitute ?? false,
  };
}

function battingRowStatusNote(innings: InningsState | null, playerId: PlayerId): string | null {
  const row = innings?.batting.find((entry) => entry.playerId === playerId);
  if (row === undefined) {
    return null;
  }
  if (row.status === 'retired_hurt' || row.status === 'retired_not_out') {
    return 'Retired, may resume';
  }
  return null;
}

export function batterOptions(setup: MatchSetup, innings: InningsState | null, candidates: readonly PlayerId[]): readonly PlayerOption[] {
  return candidates.map((id) => {
    const player = playerOf(setup, id);
    const order = player?.battingOrder ?? null;
    return playerOption(setup, id, battingRowStatusNote(innings, id), order === null ? null : `${order}`);
  });
}

export interface NextBatterVM {
  readonly heading: string;
  readonly lastOut: string | null;
  readonly options: readonly PlayerOption[];
  readonly canEndInnings: boolean;
  readonly battingTeamId: TeamId;
  readonly battingTeam: string;
}

export function selectNextBatter(setup: MatchSetup, state: MatchState, pending: Extract<PendingAction, { readonly type: 'select_next_batter' }>): NextBatterVM {
  const innings = currentInnings(state);
  const lastWicket = innings?.fallOfWickets[innings.fallOfWickets.length - 1];
  const battingTeamId = innings?.battingTeamId ?? setup.teams[0].id;
  return {
    heading: pending.position === 'striker' ? 'Next batter · on strike' : "Next batter · non-striker's end",
    lastOut: lastWicket === undefined ? null : `${playerName(setup, lastWicket.playerOutId)} is out`,
    options: batterOptions(setup, innings, pending.candidates),
    canEndInnings: pending.canEndInnings,
    battingTeamId,
    battingTeam: teamName(setup, battingTeamId),
  };
}

export interface BowlerOptionVM extends PlayerOption {
  readonly figures: string | null;
  readonly quota: string | null;
}

export interface IneligibleBowlerVM {
  readonly id: PlayerId;
  readonly label: string;
  readonly reason: string;
}

export interface NextBowlerVM {
  readonly heading: string;
  readonly overTitle: string;
  readonly overLabel: string;
  readonly eligible: readonly BowlerOptionVM[];
  readonly ineligible: readonly IneligibleBowlerVM[];
  readonly bowlingTeamId: TeamId;
  readonly bowlingTeam: string;
}

function lastOverBowled(innings: InningsState, playerId: PlayerId): number {
  for (let index = innings.overs.length - 1; index >= 0; index -= 1) {
    if (innings.overs[index].bowlerIds.includes(playerId)) {
      return innings.overs[index].overIndex;
    }
  }
  return -1;
}

export function bowlerOption(setup: MatchSetup, innings: InningsState, playerId: PlayerId): BowlerOptionVM {
  const row = innings.bowling.find((entry) => entry.playerId === playerId);
  const max = innings.limits.maxOversPerBowler;
  const figures = row === undefined || row.legalBalls + row.runsConceded + row.wickets === 0 ? null : formatBowlingFigures(row, setup.rules.ballsPerOver);
  const used = row === undefined ? '0' : formatOvers(row.legalBalls, setup.rules.ballsPerOver);
  return {
    ...playerOption(setup, playerId),
    figures,
    quota: max === null ? (figures === null ? 'Not bowled yet' : null) : `${used} of ${max} ${max === 1 ? 'over' : 'overs'}`,
  };
}

export function rankBowlers(innings: InningsState, ids: readonly PlayerId[]): readonly PlayerId[] {
  const bowled = ids.filter((id) => lastOverBowled(innings, id) >= 0).sort((a, b) => lastOverBowled(innings, b) - lastOverBowled(innings, a));
  const fresh = ids.filter((id) => lastOverBowled(innings, id) < 0);
  return [...bowled, ...fresh];
}

export function selectNextBowler(setup: MatchSetup, state: MatchState, pending: Extract<PendingAction, { readonly type: 'select_next_bowler' }>): NextBowlerVM | null {
  const innings = currentInnings(state);
  if (innings === null) {
    return null;
  }
  return {
    heading: `Over ${pending.overIndex + 1} · Choose bowler`,
    overTitle: `Over ${pending.overIndex + 1}`,
    overLabel: `over ${pending.overIndex + 1}`,
    eligible: rankBowlers(innings, pending.eligible).map((id) => bowlerOption(setup, innings, id)),
    ineligible: pending.ineligible.map((entry) => ({
      id: entry.playerId,
      label: playerName(setup, entry.playerId),
      reason: ineligibilityText(entry.reason, innings.limits.maxOversPerBowler),
    })),
    bowlingTeamId: innings.bowlingTeamId,
    bowlingTeam: teamName(setup, innings.bowlingTeamId),
  };
}

export interface ChangeBowlerVM {
  readonly eligible: readonly BowlerOptionVM[];
  readonly ineligible: readonly IneligibleBowlerVM[];
}

export function selectChangeBowler(setup: MatchSetup, state: MatchState): ChangeBowlerVM {
  const innings = currentInnings(state);
  if (innings === null || innings.status !== 'in_progress') {
    return { eligible: [], ineligible: [] };
  }
  const result = bowlerEligibility(setup, state);
  return {
    eligible: rankBowlers(innings, result.eligible.filter((id) => id !== innings.bowlerId)).map((id) => bowlerOption(setup, innings, id)),
    ineligible: result.ineligible.map((entry) => ({
      id: entry.playerId,
      label: playerName(setup, entry.playerId),
      reason: ineligibilityText(entry.reason, innings.limits.maxOversPerBowler),
    })),
  };
}

export interface ChaseVM {
  readonly headline: string;
  readonly detail: string | null;
  readonly spokenDetail?: string;
}

export interface ChasePreview {
  readonly text: string | null;
  readonly headline?: string | null;
  readonly detail?: string | null;
  readonly runsRequired?: number | null;
  readonly maxBalls?: number;
}

export function chaseOf(preview: ChasePreview | null): ChaseVM | null {
  if (preview === null || preview.text === null) {
    return null;
  }
  const headline = preview.headline ?? null;
  if (headline === null || headline.trim() === '') {
    return { headline: preview.text, detail: null };
  }
  const runs = preview.runsRequired ?? null;
  if (runs === null || preview.maxBalls === undefined) {
    return { headline, detail: preview.detail ?? null };
  }
  return { headline, detail: formatRequirementCompact(runs, preview.maxBalls), spokenDetail: formatRequirement(runs, preview.maxBalls) };
}

export interface StartInningsVM {
  readonly heading: string;
  readonly previous: string | null;
  readonly chase: ChaseVM | null;
  readonly suggestedBattingTeamId: TeamId | null;
  readonly teams: readonly { readonly id: TeamId; readonly name: string }[];
  readonly battersFor: (teamId: TeamId) => readonly PlayerOption[];
  readonly bowlersFor: (teamId: TeamId) => readonly PlayerOption[];
}

export function selectStartInnings(setup: MatchSetup, state: MatchState, pending: Extract<PendingAction, { readonly type: 'start_next_innings' }>): StartInningsVM {
  const last = state.innings[state.innings.length - 1];
  const previous =
    last === undefined
      ? null
      : `${teamName(setup, last.battingTeamId)} ${formatScore(last.runs, last.wickets)} (${formatOvers(last.legalBalls, setup.rules.ballsPerOver)} ov)${
          last.completion === null ? '' : ` · ${COMPLETION_TEXT[last.completion.reason]}`
        }`;
  const heading =
    pending.kind === 'super_over'
      ? `Super over ${pending.superOverRound ?? 1}`
      : `Start ${inningsTitle({ kind: 'regular', superOverRound: null, index: pending.inningsIndex }, regularNumberOf(state.innings, pending.inningsIndex) + 1)}`;
  return {
    heading,
    previous,
    chase: chaseOf(nextInningsPreview(setup, state)),
    suggestedBattingTeamId: pending.suggestedBattingTeamId,
    teams: setup.teams.map((team) => ({ id: team.id, name: team.name })),
    battersFor: (teamId) => squadOf(setup, teamId).map((player) => playerOption(setup, player.playerId)),
    bowlersFor: (teamId) => squadOf(setup, otherTeam(setup, teamId).id).map((player) => playerOption(setup, player.playerId)),
  };
}

export interface SuspensionVM {
  readonly heading: string;
  readonly since: string | null;
}

export function selectSuspension(setup: MatchSetup, state: MatchState): SuspensionVM | null {
  if (state.suspension === null) {
    return null;
  }
  const innings = currentInnings(state);
  const sinceSeq = state.suspension.sinceSeq;
  const before = innings?.balls.filter((ball) => ball.seq < sinceSeq) ?? [];
  const last = before[before.length - 1];
  const since = last === undefined ? null : `Since ${formatOvers(last.scoreAfter.legalBalls, setup.rules.ballsPerOver, { alwaysShowBalls: true })} overs`;
  const note = state.suspension.note === null || state.suspension.note.trim() === '' ? '' : ` · ${state.suspension.note}`;
  return { heading: `Play suspended · ${SUSPENSION_TEXT[state.suspension.reason]}${note}`, since };
}

export interface WicketOptionsVM {
  readonly isFreeHit: boolean;
  readonly dismissalsFor: (call: DeliveryCall) => readonly DeliveryDismissalType[];
  readonly striker: PlayerOption | null;
  readonly strikerLine: string | null;
  readonly nonStriker: PlayerOption | null;
  readonly bowlerId: PlayerId | null;
  readonly keeperId: PlayerId | null;
  readonly fielders: readonly PlayerOption[];
  readonly stumpers: readonly PlayerOption[];
  readonly nextBatters: readonly PlayerOption[];
  readonly lastWicketNote: string;
}

export function selectWicketOptions(setup: MatchSetup, state: MatchState): WicketOptionsVM | null {
  const innings = currentInnings(state);
  if (innings === null || innings.status !== 'in_progress' || innings.strikerId === null) {
    return null;
  }
  const isFreeHit = innings.isFreeHitNext;
  const keeper = setup.players.find((player) => player.teamId === innings.bowlingTeamId && player.isWicketKeeper && !player.isSubstitute) ?? null;
  const bowlerId = innings.bowlerId;
  const squad = squadOf(setup, innings.bowlingTeamId, { substitutes: true });
  const ordered = [
    ...squad.filter((player) => player.playerId === bowlerId),
    ...squad.filter((player) => player.playerId === keeper?.playerId && player.playerId !== bowlerId),
    ...squad.filter((player) => player.playerId !== bowlerId && player.playerId !== keeper?.playerId && !player.isSubstitute),
    ...squad.filter((player) => player.isSubstitute),
  ];
  const fielders = ordered.map((player) => {
    const tag = player.playerId === bowlerId ? 'c&b' : player.playerId === keeper?.playerId ? 'WK' : player.isSubstitute ? 'sub' : null;
    return playerOption(setup, player.playerId, null, tag);
  });
  const stumpers = [
    ...squad.filter((player) => player.playerId === keeper?.playerId),
    ...squad.filter((player) => player.playerId !== keeper?.playerId && !player.isSubstitute),
    ...squad.filter((player) => player.playerId !== keeper?.playerId && player.isSubstitute),
  ].map((player) => playerOption(setup, player.playerId, null, player.playerId === keeper?.playerId ? 'WK' : player.isSubstitute ? 'sub' : null));
  const strikerRow = innings.batting.find((row) => row.playerId === innings.strikerId);
  const striker = playerOption(setup, innings.strikerId);
  return {
    isFreeHit,
    dismissalsFor: (call) => allowedDismissals(call, isFreeHit),
    striker,
    strikerLine: `Striker: ${striker.label} (${strikerRow?.runs ?? 0})`,
    nonStriker: innings.nonStrikerId === null ? null : playerOption(setup, innings.nonStrikerId),
    bowlerId,
    keeperId: keeper?.playerId ?? null,
    fielders,
    stumpers,
    nextBatters: batterOptions(setup, innings, eligibleIncomingBatters(setup, state)),
    lastWicketNote: setup.rules.lastManStands ? 'No batter left to come in' : 'Last wicket: the innings ends',
  };
}

export interface ReviseOversTarget {
  readonly inningsIndex: number;
  readonly label: string;
  readonly currentOvers: number;
  readonly currentLimit: string;
  readonly ballsBowled: number;
  readonly isChase: boolean;
  readonly canApplyToBoth: boolean;
  readonly maxOversPerBowler: number | null;
}

export function reviseTargetOf(setup: MatchSetup, state: MatchState): ReviseOversTarget | null {
  const innings = currentInnings(state);
  if (innings === null) {
    return null;
  }
  const bpo = setup.rules.ballsPerOver;
  return {
    inningsIndex: innings.index,
    label: `${teamName(setup, innings.battingTeamId)} innings`,
    currentOvers: Math.max(1, Math.floor(innings.limits.maxBalls / bpo)),
    currentLimit: plural(formatOvers(innings.limits.maxBalls, bpo), 'over'),
    ballsBowled: innings.legalBalls,
    isChase: innings.target !== null,
    canApplyToBoth: innings.index === 0 && innings.kind === 'regular',
    maxOversPerBowler: innings.limits.maxOversPerBowler,
  };
}

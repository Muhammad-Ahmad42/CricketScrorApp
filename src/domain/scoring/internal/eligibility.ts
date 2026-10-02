import type {
  BatterStatus,
  BowlerIneligibility,
  CreasePosition,
  InningsState,
  MatchSetup,
  MatchState,
  PlayerId,
} from '../../types';
import { quotaReached } from './limits';
import { battingSquad, playersInSide } from './squad';

export function inProgressInnings(state: Pick<MatchState, 'innings'>): InningsState | null {
  const last = state.innings[state.innings.length - 1];
  return last !== undefined && last.status === 'in_progress' ? last : null;
}

export function latestInnings(state: Pick<MatchState, 'innings'>): InningsState | null {
  return state.innings[state.innings.length - 1] ?? null;
}

export function loneAtWickets(setup: MatchSetup, innings: Pick<InningsState, 'battingTeamId' | 'limits'>, wickets: number): boolean {
  if (!setup.rules.lastManStands) {
    return false;
  }
  const size = playersInSide(setup, innings.battingTeamId);
  return innings.limits.maxWickets === size && wickets === size - 1;
}

export function isLoneMode(setup: MatchSetup, innings: InningsState): boolean {
  return loneAtWickets(setup, innings, innings.wickets);
}

export function vacancies(setup: MatchSetup, innings: InningsState): readonly CreasePosition[] {
  const open: CreasePosition[] = [];
  if (innings.strikerId === null) {
    open.push('striker');
  }
  if (innings.nonStrikerId === null && !isLoneMode(setup, innings)) {
    open.push('non_striker');
  }
  return open;
}

export function hasVacancy(setup: MatchSetup, innings: InningsState): boolean {
  return vacancies(setup, innings).length > 0;
}

export function isAtCrease(innings: InningsState, playerId: PlayerId): boolean {
  return innings.strikerId === playerId || innings.nonStrikerId === playerId;
}

export function batterStatus(innings: InningsState, playerId: PlayerId): BatterStatus {
  return innings.batting.find((row) => row.playerId === playerId)?.status ?? 'yet_to_bat';
}

function superOverRestricted(setup: MatchSetup, innings: InningsState): boolean {
  return innings.kind === 'super_over' && setup.rules.superOver.restrictRepeatPlayers && (innings.superOverRound ?? 1) >= 2;
}

export function dismissedInEarlierSuperOvers(state: Pick<MatchState, 'innings'>, round: number): ReadonlySet<PlayerId> {
  const out = new Set<PlayerId>();
  for (const innings of state.innings) {
    if (innings.kind === 'super_over' && (innings.superOverRound ?? 0) < round) {
      for (const row of innings.batting) {
        if (row.status === 'out') {
          out.add(row.playerId);
        }
      }
    }
  }
  return out;
}

export function previousSuperOverBowlers(state: Pick<MatchState, 'innings'>, round: number): ReadonlySet<PlayerId> {
  const bowlers = new Set<PlayerId>();
  for (const innings of state.innings) {
    if (innings.kind === 'super_over' && innings.superOverRound === round - 1) {
      for (const row of innings.bowling) {
        bowlers.add(row.playerId);
      }
    }
  }
  return bowlers;
}

export function batterBarredFromSuperOver(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings'>,
  innings: InningsState,
  playerId: PlayerId,
): boolean {
  return superOverRestricted(setup, innings) && dismissedInEarlierSuperOvers(state, innings.superOverRound ?? 1).has(playerId);
}

export function bowlerBarredFromSuperOver(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings'>,
  innings: InningsState,
  playerId: PlayerId,
): boolean {
  return superOverRestricted(setup, innings) && previousSuperOverBowlers(state, innings.superOverRound ?? 1).has(playerId);
}

export function retiredNotOutMayReturn(setup: MatchSetup, yetToBatRemain: boolean): boolean {
  if (yetToBatRemain) {
    return false;
  }
  const rule = setup.rules.mandatoryRetirement;
  return rule === null || rule.mayReturn;
}

export function incomingBatters(setup: MatchSetup, state: Pick<MatchState, 'innings'>, innings: InningsState): readonly PlayerId[] {
  const squad = battingSquad(setup, innings.battingTeamId).filter(
    (player) => !isAtCrease(innings, player.playerId) && !batterBarredFromSuperOver(setup, state, innings, player.playerId),
  );
  const yetToBat = squad.filter((player) => batterStatus(innings, player.playerId) === 'yet_to_bat').map((player) => player.playerId);
  const byPosition = (status: BatterStatus): readonly PlayerId[] =>
    innings.batting
      .filter((row) => row.status === status && squad.some((player) => player.playerId === row.playerId))
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((row) => row.playerId);
  const retiredHurt = byPosition('retired_hurt');
  const retiredNotOut = retiredNotOutMayReturn(setup, yetToBat.length > 0) ? byPosition('retired_not_out') : [];
  return [...yetToBat, ...retiredHurt, ...retiredNotOut];
}

export function yetToBatRemain(setup: MatchSetup, state: Pick<MatchState, 'innings'>, innings: InningsState): boolean {
  return incomingBatters(setup, state, innings).some((playerId) => batterStatus(innings, playerId) === 'yet_to_bat');
}

export function replacedThisOver(innings: InningsState): readonly PlayerId[] {
  const over = innings.currentOver;
  if (over === null) {
    return [];
  }
  return over.bowlerIds.filter((playerId) => playerId !== innings.bowlerId);
}

export function bowlerIneligibility(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings'>,
  innings: InningsState,
  playerId: PlayerId,
): BowlerIneligibility | null {
  const midOver = innings.currentOver !== null;
  if (innings.removedBowlerIds.includes(playerId)) {
    return 'removed_from_attack';
  }
  if (midOver && (playerId === innings.bowlerId || replacedThisOver(innings).includes(playerId))) {
    return 'replaced_this_over';
  }
  if (!setup.rules.allowBowlerConsecutiveOvers && innings.previousOverBowlerIds.includes(playerId)) {
    return 'bowled_previous_over';
  }
  if (quotaReached(innings.limits, innings.bowling, playerId)) {
    return 'quota_reached';
  }
  if (bowlerBarredFromSuperOver(setup, state, innings, playerId)) {
    return 'bowled_previous_super_over';
  }
  return null;
}

export function bowlerCandidates(setup: MatchSetup, innings: InningsState): readonly PlayerId[] {
  return setup.players
    .filter((player) => player.teamId === innings.bowlingTeamId && !player.isSubstitute)
    .map((player) => player.playerId);
}

export function bowlerEligibilityOf(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings'>,
  innings: InningsState,
): { readonly eligible: readonly PlayerId[]; readonly ineligible: readonly { readonly playerId: PlayerId; readonly reason: BowlerIneligibility }[] } {
  const eligible: PlayerId[] = [];
  const ineligible: { playerId: PlayerId; reason: BowlerIneligibility }[] = [];
  for (const playerId of bowlerCandidates(setup, innings)) {
    const reason = bowlerIneligibility(setup, state, innings, playerId);
    if (reason === null) {
      eligible.push(playerId);
    } else {
      ineligible.push({ playerId, reason });
    }
  }
  return { eligible, ineligible };
}

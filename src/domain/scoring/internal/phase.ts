import type { MatchSetup, MatchState, TeamId } from '../../types';
import { otherTeamId } from './squad';

export function phaseOfIndex(inningsIndex: number): number {
  return inningsIndex < 2 ? 0 : Math.floor(inningsIndex / 2);
}

export function currentPhase(state: Pick<MatchState, 'superOverRound'>): number {
  return state.superOverRound ?? 0;
}

export function phaseIndexes(phase: number): readonly [number, number] {
  return phase === 0 ? [0, 1] : [2 * phase, 2 * phase + 1];
}

export function expectedBattingTeam(setup: MatchSetup, state: Pick<MatchState, 'innings'>, inningsIndex: number): TeamId | null {
  const started = state.innings[inningsIndex];
  if (started !== undefined) {
    return started.battingTeamId;
  }
  if (inningsIndex % 2 === 1) {
    const partner = state.innings[inningsIndex - 1];
    return partner === undefined ? null : otherTeamId(setup, partner.battingTeamId);
  }
  return null;
}

export function penaltyPlacementValid(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings' | 'superOverRound'>,
  teamId: TeamId,
  inningsIndex: number,
): boolean {
  const [first, second] = phaseIndexes(currentPhase(state));
  if (inningsIndex !== first && inningsIndex !== second) {
    return false;
  }
  const started = state.innings[inningsIndex];
  if (started !== undefined) {
    return started.battingTeamId === teamId;
  }
  if (inningsIndex === second && state.innings[first] === undefined && first !== 0) {
    return true;
  }
  const expected = expectedBattingTeam(setup, state, inningsIndex);
  return expected === null || expected === teamId;
}

export function defaultPenaltyInnings(
  setup: MatchSetup,
  state: Pick<MatchState, 'innings' | 'superOverRound'>,
  teamId: TeamId,
): number {
  const [first, second] = phaseIndexes(currentPhase(state));
  for (const index of [second, first]) {
    if (state.innings[index]?.battingTeamId === teamId) {
      return index;
    }
  }
  const firstInnings = state.innings[first];
  if (firstInnings === undefined) {
    return first;
  }
  return expectedBattingTeam(setup, state, second) === teamId ? second : first;
}

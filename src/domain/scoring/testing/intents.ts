import type {
  BallCount,
  MatchEndOutcome,
  OffBallDismissalType,
  PlayerId,
  RetirementKind,
  SuspensionReason,
  TeamId,
} from '../../types';
import type { ScoringIntent } from '../commands';

export function startInnings(strikerId: PlayerId, nonStrikerId: PlayerId, bowlerId: PlayerId, battingTeamId?: TeamId): ScoringIntent {
  return battingTeamId === undefined
    ? { type: 'start_innings', strikerId, nonStrikerId, bowlerId }
    : { type: 'start_innings', strikerId, nonStrikerId, bowlerId, battingTeamId };
}

export function retire(playerId: PlayerId, retirement: RetirementKind, nextBatterId?: PlayerId): ScoringIntent {
  return { type: 'retire', playerId, retirement, nextBatterId: nextBatterId ?? null };
}

export function offBallDismissal(
  playerId: PlayerId,
  dismissal: OffBallDismissalType,
  opts?: { readonly fielderIds?: readonly PlayerId[]; readonly nextBatterId?: PlayerId },
): ScoringIntent {
  return { type: 'off_ball_dismissal', playerId, dismissal, fielderIds: opts?.fielderIds ?? [], nextBatterId: opts?.nextBatterId ?? null };
}

export function penalty(teamId: TeamId, runs = 5, inningsIndex?: number): ScoringIntent {
  return inningsIndex === undefined
    ? { type: 'penalty', teamId, runs, reason: 'Penalty runs' }
    : { type: 'penalty', teamId, runs, reason: 'Penalty runs', inningsIndex };
}

export function reviseOvers(
  inningsIndex: number,
  spec: {
    readonly overs?: number;
    readonly balls?: BallCount;
    readonly target?: number | null;
    readonly scope?: 'this_innings' | 'both_innings';
    readonly terminal?: boolean;
  },
): ScoringIntent {
  return { type: 'revise_overs', inningsIndex, reason: 'Rain', ...spec };
}

export function suspendPlay(reason: SuspensionReason = 'rain'): ScoringIntent {
  return { type: 'suspend_play', reason, note: null };
}

export function resumePlay(): ScoringIntent {
  return { type: 'resume_play' };
}

export function declare(): ScoringIntent {
  return { type: 'end_innings', reason: 'declared', absentees: [] };
}

export function battersUnavailable(absentees: readonly { readonly playerId: PlayerId; readonly hurt: boolean }[]): ScoringIntent {
  return { type: 'end_innings', reason: 'batters_unavailable', absentees };
}

export function startSuperOver(): ScoringIntent {
  return { type: 'start_super_over' };
}

export function endMatch(outcome: MatchEndOutcome = { type: 'natural' }): ScoringIntent {
  return { type: 'end_match', outcome };
}

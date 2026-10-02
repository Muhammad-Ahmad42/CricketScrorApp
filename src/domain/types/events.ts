import type { ActionId, BallCount, EventId, IsoDateTime, MatchId, PlayerId, Seq, TeamId } from './primitives';
import type { TieDecisionMethod, WinMargin } from './match';
import type { BowlerQuotaMode, PowerplayRule } from './rules';

export const DELIVERY_CALLS = ['fair', 'wide', 'no_ball'] as const;
export type DeliveryCall = (typeof DELIVERY_CALLS)[number];

export const RUNS_TO = ['bat', 'bye', 'leg_bye'] as const;
export type RunsTo = (typeof RUNS_TO)[number];

export type BoundaryAllowance = 0 | 4 | 6;

export const DELIVERY_DISMISSAL_TYPES = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'hit_ball_twice',
  'obstructing_field',
  'handled_ball',
] as const;
export type DeliveryDismissalType = (typeof DELIVERY_DISMISSAL_TYPES)[number];

export const OFF_BALL_DISMISSAL_TYPES = ['timed_out', 'run_out', 'obstructing_field'] as const;
export type OffBallDismissalType = (typeof OFF_BALL_DISMISSAL_TYPES)[number];

export const RETIREMENT_KINDS = ['retired_hurt', 'retired_not_out', 'retired_out'] as const;
export type RetirementKind = (typeof RETIREMENT_KINDS)[number];

export type DismissalType = DeliveryDismissalType | OffBallDismissalType | 'retired_out';

export const BOWLER_CREDITED_DISMISSALS = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'] as const;

export type CreaseEnd = 'striker_end' | 'non_striker_end';
export type CreasePosition = 'striker' | 'non_striker';

export type SuspensionReason = 'rain' | 'bad_light' | 'wet_outfield' | 'interval' | 'injury' | 'other';

export interface DeliveryWicket {
  readonly type: DeliveryDismissalType;
  readonly playerOutId: PlayerId;
  readonly fielderIds: readonly PlayerId[];
  readonly dismissalEnd: CreaseEnd | null;
}

interface DeliveryCommon {
  readonly kind: 'delivery';
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId | null;
  readonly bowlerId: PlayerId;
  readonly runsRun: number;
  readonly shortRuns: number;
  readonly boundary: BoundaryAllowance;
  readonly wicket: DeliveryWicket | null;
}

export type DeliveryPayload =
  | (DeliveryCommon & { readonly call: 'fair' | 'no_ball'; readonly runsTo: RunsTo })
  | (DeliveryCommon & { readonly call: 'wide' });

export interface InningsStartedPayload {
  readonly kind: 'innings_started';
  readonly inningsIndex: number;
  readonly battingTeamId: TeamId;
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId;
  readonly bowlerId: PlayerId;
}

export interface BatterInPayload {
  readonly kind: 'batter_in';
  readonly playerId: PlayerId;
  readonly position: CreasePosition;
}

export type BowlerSelectionReason = 'over_start' | 'injury' | 'suspended';

export interface BowlerSelectedPayload {
  readonly kind: 'bowler_selected';
  readonly bowlerId: PlayerId;
  readonly reason: BowlerSelectionReason;
}

export interface StrikeSwappedPayload {
  readonly kind: 'strike_swapped';
}

export interface BatterRetiredPayload {
  readonly kind: 'batter_retired';
  readonly playerId: PlayerId;
  readonly retirement: RetirementKind;
}

export interface BatterDismissedPayload {
  readonly kind: 'batter_dismissed';
  readonly playerId: PlayerId;
  readonly type: OffBallDismissalType;
  readonly fielderIds: readonly PlayerId[];
}

export interface PenaltyAwardedPayload {
  readonly kind: 'penalty_awarded';
  readonly teamId: TeamId;
  readonly inningsIndex: number;
  readonly runs: number;
  readonly reason: string;
}

export interface OversRevisedPayload {
  readonly kind: 'overs_revised';
  readonly inningsIndex: number;
  readonly maxBalls: BallCount;
  readonly target: number | null;
  readonly maxOversPerBowler?: number | null;
  readonly bowlerQuotaMode?: BowlerQuotaMode;
  readonly powerplays?: readonly PowerplayRule[];
  readonly terminal: boolean;
  readonly reason: string;
}

export interface PlaySuspendedPayload {
  readonly kind: 'play_suspended';
  readonly reason: SuspensionReason;
  readonly note: string | null;
}

export interface PlayResumedPayload {
  readonly kind: 'play_resumed';
}

export interface InningsEndedPayload {
  readonly kind: 'innings_ended';
  readonly reason: 'declared' | 'batters_unavailable';
  readonly absentees: readonly { readonly playerId: PlayerId; readonly hurt: boolean }[];
}

export interface SuperOverStartedPayload {
  readonly kind: 'super_over_started';
  readonly round: number;
}

export type MatchEndOutcome =
  | { readonly type: 'natural' }
  | { readonly type: 'tie_decided'; readonly method: Exclude<TieDecisionMethod, 'super_over'>; readonly winnerTeamId: TeamId }
  | { readonly type: 'no_result'; readonly reason: string | null }
  | { readonly type: 'abandoned'; readonly reason: string | null }
  | { readonly type: 'walkover'; readonly winnerTeamId: TeamId; readonly reason: string | null }
  | { readonly type: 'awarded'; readonly winnerTeamId: TeamId | null; readonly reason: string; readonly margin: WinMargin | null };

export interface MatchEndedPayload {
  readonly kind: 'match_ended';
  readonly outcome: MatchEndOutcome;
}

export type MatchEventPayload =
  | InningsStartedPayload
  | DeliveryPayload
  | BatterInPayload
  | BowlerSelectedPayload
  | StrikeSwappedPayload
  | BatterRetiredPayload
  | BatterDismissedPayload
  | PenaltyAwardedPayload
  | OversRevisedPayload
  | PlaySuspendedPayload
  | PlayResumedPayload
  | InningsEndedPayload
  | SuperOverStartedPayload
  | MatchEndedPayload;

export type MatchEventKind = MatchEventPayload['kind'];

export const MATCH_EVENT_KINDS = [
  'innings_started',
  'delivery',
  'batter_in',
  'bowler_selected',
  'strike_swapped',
  'batter_retired',
  'batter_dismissed',
  'penalty_awarded',
  'overs_revised',
  'play_suspended',
  'play_resumed',
  'innings_ended',
  'super_over_started',
  'match_ended',
] as const satisfies readonly MatchEventKind[];

const MATCH_EVENT_KINDS_EXHAUSTIVE: [Exclude<MatchEventKind, (typeof MATCH_EVENT_KINDS)[number]>] extends [never]
  ? true
  : false = true;
void MATCH_EVENT_KINDS_EXHAUSTIVE;

export type MatchEventInput = MatchEventPayload;

export interface EventEnvelope {
  readonly id: EventId;
  readonly matchId: MatchId;
  readonly seq: Seq;
  readonly actionId: ActionId;
  readonly recordedAt: IsoDateTime;
}

export type MatchEvent = MatchEventPayload & EventEnvelope;

export type MatchEventOf<K extends MatchEventKind> = Extract<MatchEvent, { readonly kind: K }>;
export type MatchEventPayloadOf<K extends MatchEventKind> = Extract<MatchEventPayload, { readonly kind: K }>;

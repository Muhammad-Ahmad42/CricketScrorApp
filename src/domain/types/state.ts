import type { CreasePosition, DeliveryCall, DismissalType, RunsTo, SuspensionReason } from './events';
import type { MatchResult } from './match';
import type { BallCount, EventId, IsoDateTime, MatchId, PlayerId, Runs, Seq, TeamId } from './primitives';
import type { BowlerQuotaMode, PowerplayRule } from './rules';
import type { ReplayIssue } from './validation';

export type InningsKind = 'regular' | 'super_over';

export type InningsCompletionReason =
  | 'all_out'
  | 'overs_complete'
  | 'target_reached'
  | 'declared'
  | 'batters_unavailable'
  | 'match_ended'
  | 'terminated';

export interface ExtrasBreakdown {
  readonly wides: Runs;
  readonly noBalls: Runs;
  readonly byes: Runs;
  readonly legByes: Runs;
  readonly penalty: Runs;
  readonly total: Runs;
}

export type BallTokenKind = 'dot' | 'runs' | 'four' | 'six' | 'wicket' | 'wide' | 'no_ball' | 'bye' | 'leg_bye';

export interface BallToken {
  readonly text: string;
  readonly kind: BallTokenKind;
  readonly isLegal: boolean;
  readonly isFreeHit: boolean;
  readonly accessibilityLabel: string;
}

export interface DismissalRecord {
  readonly type: DismissalType;
  readonly playerOutId: PlayerId;
  readonly bowlerId: PlayerId | null;
  readonly creditedBowlerId: PlayerId | null;
  readonly fielderIds: readonly PlayerId[];
  readonly text: string;
  readonly wicketNumber: number;
  readonly teamRuns: Runs;
  readonly legalBalls: BallCount;
  readonly seq: Seq;
  readonly onDelivery: boolean;
}

export interface DeliveryRunsBreakdown {
  readonly wides: Runs;
  readonly noBalls: Runs;
  readonly byes: Runs;
  readonly legByes: Runs;
}

export interface BallRecord {
  readonly seq: Seq;
  readonly eventId: EventId;
  readonly inningsIndex: number;
  readonly overIndex: number;
  readonly ballInOver: number;
  readonly deliveryInOver: number;
  readonly label: string;
  readonly isLegal: boolean;
  readonly isBallFaced: boolean;
  readonly isFreeHit: boolean;
  readonly strikerId: PlayerId;
  readonly nonStrikerId: PlayerId | null;
  readonly bowlerId: PlayerId;
  readonly call: DeliveryCall;
  readonly runsTo: RunsTo | 'wide';
  readonly runsRun: number;
  readonly shortRuns: number;
  readonly boundary: 0 | 4 | 6;
  readonly batterRuns: Runs;
  readonly extras: DeliveryRunsBreakdown;
  readonly extraRuns: Runs;
  readonly totalRuns: Runs;
  readonly bowlerRuns: Runs;
  readonly isFour: boolean;
  readonly isSix: boolean;
  readonly wicket: DismissalRecord | null;
  readonly endsOver: boolean;
  readonly scoreAfter: { readonly runs: Runs; readonly wickets: number; readonly legalBalls: BallCount };
  readonly powerplayName: string | null;
  readonly token: BallToken;
  readonly recordedAt: IsoDateTime;
}

export type BatterStatus = 'yet_to_bat' | 'not_out' | 'out' | 'retired_hurt' | 'retired_not_out' | 'absent';

export interface BattingCardRow {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly position: number | null;
  readonly status: BatterStatus;
  readonly atCrease: CreasePosition | null;
  readonly runs: Runs;
  readonly balls: BallCount;
  readonly fours: number;
  readonly sixes: number;
  readonly dots: number;
  readonly strikeRate: number | null;
  readonly dismissal: DismissalRecord | null;
  readonly dismissalText: string;
  readonly returnedFromRetirement: boolean;
}

export interface BowlingCardRow {
  readonly playerId: PlayerId;
  readonly name: string;
  readonly order: number;
  readonly legalBalls: BallCount;
  readonly oversUsed: number;
  readonly maidens: number;
  readonly runsConceded: Runs;
  readonly wickets: number;
  readonly economy: number | null;
  readonly dots: number;
  readonly wideDeliveries: number;
  readonly wideRuns: Runs;
  readonly noBallDeliveries: number;
  readonly foursConceded: number;
  readonly sixesConceded: number;
  readonly isCurrent: boolean;
}

export interface Partnership {
  readonly index: number;
  readonly wicketNumber: number;
  readonly batterAId: PlayerId;
  readonly batterBId: PlayerId | null;
  readonly runs: Runs;
  readonly balls: BallCount;
  readonly batterARuns: Runs;
  readonly batterABalls: BallCount;
  readonly batterBRuns: Runs;
  readonly batterBBalls: BallCount;
  readonly extras: Runs;
  readonly endedBy: 'wicket' | 'retirement' | 'innings_end' | null;
}

export interface FallOfWicket {
  readonly wicketNumber: number;
  readonly playerOutId: PlayerId;
  readonly teamRuns: Runs;
  readonly legalBalls: BallCount;
  readonly overLabel: string;
  readonly dismissalType: DismissalType;
  readonly seq: Seq;
}

export interface OverSummary {
  readonly overIndex: number;
  readonly bowlerIds: readonly PlayerId[];
  readonly runs: Runs;
  readonly bowlerRuns: Runs;
  readonly wickets: number;
  readonly legalBalls: BallCount;
  readonly extras: Runs;
  readonly tokens: readonly BallToken[];
  readonly isComplete: boolean;
  readonly isMaiden: boolean;
  readonly scoreAtEnd: { readonly runs: Runs; readonly wickets: number };
}

export interface PowerplayPhaseStatus {
  readonly rule: PowerplayRule;
  readonly state: 'upcoming' | 'active' | 'complete';
  readonly runs: Runs;
  readonly wickets: number;
  readonly legalBalls: BallCount;
}

export interface PowerplayStatus {
  readonly active: PowerplayRule | null;
  readonly phases: readonly PowerplayPhaseStatus[];
}

export interface InningsLimits {
  readonly maxBalls: BallCount;
  readonly maxWickets: number;
  readonly maxOversPerBowler: number | null;
  readonly bowlerQuotaMode: BowlerQuotaMode;
  readonly extraOverBowlers: number;
  readonly revised: boolean;
}

export interface TargetInfo {
  readonly runs: Runs;
  readonly revised: boolean;
  readonly source: 'first_innings' | 'revision' | 'super_over';
}

export interface OversRevisionRecord {
  readonly seq: Seq;
  readonly maxBalls: BallCount;
  readonly target: Runs | null;
  readonly maxOversPerBowler: number | null;
  readonly terminal: boolean;
  readonly reason: string;
}

export interface InningsState {
  readonly index: number;
  readonly kind: InningsKind;
  readonly superOverRound: number | null;
  readonly battingTeamId: TeamId;
  readonly bowlingTeamId: TeamId;
  readonly status: 'in_progress' | 'complete';
  readonly completion: { readonly reason: InningsCompletionReason; readonly atSeq: Seq } | null;
  readonly runs: Runs;
  readonly wickets: number;
  readonly legalBalls: BallCount;
  readonly extras: ExtrasBreakdown;
  readonly limits: InningsLimits;
  readonly target: TargetInfo | null;
  readonly strikerId: PlayerId | null;
  readonly nonStrikerId: PlayerId | null;
  readonly bowlerId: PlayerId | null;
  readonly previousOverBowlerIds: readonly PlayerId[];
  readonly removedBowlerIds: readonly PlayerId[];
  readonly isFreeHitNext: boolean;
  readonly currentOver: OverSummary | null;
  readonly balls: readonly BallRecord[];
  readonly overs: readonly OverSummary[];
  readonly batting: readonly BattingCardRow[];
  readonly bowling: readonly BowlingCardRow[];
  readonly partnerships: readonly Partnership[];
  readonly currentPartnership: Partnership | null;
  readonly fallOfWickets: readonly FallOfWicket[];
  readonly powerplay: PowerplayStatus;
  readonly revisions: readonly OversRevisionRecord[];
  readonly runRate: number | null;
}

export interface ChaseState {
  readonly target: Runs;
  readonly runsRequired: Runs;
  readonly ballsRemaining: BallCount;
  readonly requiredRunRate: number | null;
}

export type BowlerIneligibility =
  | 'bowled_previous_over'
  | 'quota_reached'
  | 'replaced_this_over'
  | 'removed_from_attack'
  | 'bowled_previous_super_over';

export type PendingAction =
  | {
      readonly type: 'start_next_innings';
      readonly inningsIndex: number;
      readonly kind: InningsKind;
      readonly superOverRound: number | null;
      readonly suggestedBattingTeamId: TeamId | null;
    }
  | {
      readonly type: 'select_next_batter';
      readonly position: CreasePosition;
      readonly candidates: readonly PlayerId[];
      readonly canEndInnings: boolean;
    }
  | {
      readonly type: 'select_next_bowler';
      readonly overIndex: number;
      readonly eligible: readonly PlayerId[];
      readonly ineligible: readonly { readonly playerId: PlayerId; readonly reason: BowlerIneligibility }[];
    }
  | { readonly type: 'resume_play'; readonly reason: SuspensionReason }
  | {
      readonly type: 'resolve_tie';
      readonly options: readonly ('super_over' | 'accept_tie' | 'decide_other')[];
      readonly nextSuperOverRound: number | null;
    }
  | { readonly type: 'confirm_result'; readonly result: MatchResult; readonly text: string };

export type PendingActionType = PendingAction['type'];

export type MatchLifecycle = 'not_started' | 'live' | 'paused' | 'completed' | 'abandoned';

export interface MatchState {
  readonly matchId: MatchId;
  readonly lifecycle: MatchLifecycle;
  readonly innings: readonly InningsState[];
  readonly currentInningsIndex: number | null;
  readonly superOverRound: number | null;
  readonly chase: ChaseState | null;
  readonly currentRunRate: number | null;
  readonly pendingAction: PendingAction | null;
  readonly canRecordDelivery: boolean;
  readonly retirementsDue: readonly { readonly playerId: PlayerId; readonly atRuns: number }[];
  readonly naturalResult: MatchResult | null;
  readonly result: MatchResult | null;
  readonly resultText: string | null;
  readonly suspension: { readonly reason: SuspensionReason; readonly note: string | null; readonly sinceSeq: Seq } | null;
  readonly plannedRevisions: readonly {
    readonly inningsIndex: number;
    readonly revision: OversRevisionRecord;
    readonly powerplays: readonly PowerplayRule[] | null;
  }[];
  readonly carriedPenalties: readonly { readonly inningsIndex: number; readonly teamId: TeamId; readonly runs: Runs }[];
  readonly lastSeq: Seq;
  readonly lastAppliedSeq: Seq;
  readonly issues: readonly ReplayIssue[];
  readonly needsRepair: boolean;
}

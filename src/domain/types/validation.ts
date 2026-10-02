import type { EventId, Seq } from './primitives';

export const EVENT_VALIDATION_CODES = [
  'MATCH_ALREADY_ENDED',
  'MATCH_NOT_STARTED',
  'PLAY_SUSPENDED',
  'NOT_SUSPENDED',
  'PENDING_ACTION_REQUIRED',
  'INNINGS_NOT_IN_PROGRESS',
  'INNINGS_STILL_IN_PROGRESS',
  'WRONG_INNINGS_INDEX',
  'WRONG_BATTING_TEAM',
  'TOSS_MISMATCH',
  'SUPER_OVER_NOT_STARTED',
  'SUPER_OVER_NOT_ALLOWED',
  'SUPER_OVER_LIMIT_REACHED',
  'PLAYER_NOT_IN_SQUAD',
  'PLAYER_WRONG_SIDE',
  'SAME_PLAYER_BOTH_ENDS',
  'BATTER_NOT_AT_CREASE',
  'BATTER_ALREADY_BATTING',
  'BATTER_ALREADY_OUT',
  'BATTER_NOT_ELIGIBLE',
  'SUBSTITUTE_NOT_ALLOWED',
  'PLAYER_INELIGIBLE_SUPER_OVER',
  'NO_VACANCY',
  'POSITION_NOT_VACANT',
  'VACANCY_MUST_BE_FILLED',
  'BOWLER_NOT_SELECTED',
  'BOWLER_CONSECUTIVE_OVERS',
  'BOWLER_QUOTA_REACHED',
  'BOWLER_ALREADY_REPLACED',
  'BOWLER_REMOVED_FROM_ATTACK',
  'BOWLER_CHANGE_REASON_INVALID',
  'CONTEXT_MISMATCH',
  'INVALID_RUNS',
  'INVALID_SHORT_RUNS',
  'INVALID_BOUNDARY',
  'SIX_NOT_OFF_BAT',
  'RUNS_NOT_ALLOWED_WITH_DISMISSAL',
  'DISMISSAL_NOT_ALLOWED_ON_CALL',
  'DISMISSAL_NOT_ALLOWED_ON_FREE_HIT',
  'DISMISSED_PLAYER_NOT_AT_CREASE',
  'DISMISSAL_END_REQUIRED',
  'DISMISSAL_END_NOT_ALLOWED',
  'FIELDER_NOT_IN_FIELDING_SIDE',
  'TOO_MANY_FIELDERS',
  'WICKET_AFTER_RESULT',
  'INVALID_PENALTY',
  'INVALID_PENALTY_INNINGS',
  'INVALID_ABSENTEE',
  'INVALID_OVERS_REVISION',
  'INVALID_TARGET',
  'NOTHING_TO_SWAP',
  'NATURAL_RESULT_NOT_REACHED',
  'RESULT_NOT_TIED',
  'WALKOVER_AFTER_PLAY',
  'TEAM_NOT_IN_MATCH',
  'SEQ_OUT_OF_ORDER',
  'UNKNOWN_EVENT_KIND',
] as const;
export type EventValidationCode = (typeof EVENT_VALIDATION_CODES)[number];

export const EVENT_WARNING_CODES = [
  'BOWLER_QUOTA_LAST_OVER',
  'TARGET_REVISION_WITHOUT_OVERS_CHANGE',
  'CHASE_OVERS_NOT_REVISED',
  'SQUAD_EXHAUSTED',
  'UNUSUAL_RUNS',
  'FIELDER_UNKNOWN',
] as const;
export type EventWarningCode = (typeof EVENT_WARNING_CODES)[number];

export interface ValidationWarning {
  readonly code: EventWarningCode;
  readonly message: string;
}

export type ValidationMode = 'append' | 'replay';

export type ValidationResult =
  | { readonly ok: true; readonly warnings: readonly ValidationWarning[] }
  | { readonly ok: false; readonly code: EventValidationCode; readonly message: string };

export interface ReplayIssue {
  readonly seq: Seq;
  readonly eventId: EventId;
  readonly severity: 'error' | 'warning';
  readonly code: EventValidationCode;
  readonly message: string;
}

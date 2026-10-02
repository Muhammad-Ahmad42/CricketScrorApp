import {
  DELIVERY_CALLS,
  MATCH_EVENT_KINDS,
  OFF_BALL_DISMISSAL_TYPES,
  RETIREMENT_KINDS,
  RUNS_TO,
  type BowlerQuotaMode,
  type MatchEventKind,
  type SuspensionReason,
  type TieDecisionMethod,
} from '../../types';
import {
  isBoolean,
  isInt,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
  isStringArray,
  type UnknownRecord,
} from './guards';

const CREASE_ENDS = ['striker_end', 'non_striker_end'] as const;
const POSITIONS = ['striker', 'non_striker'] as const;
const SUSPENSION_REASONS: readonly SuspensionReason[] = ['rain', 'bad_light', 'wet_outfield', 'interval', 'injury', 'other'];
const QUOTA_MODES: readonly BowlerQuotaMode[] = ['uniform', 'icc_one_fifth'];
const TIE_METHODS: readonly Exclude<TieDecisionMethod, 'super_over'>[] = ['boundary_count', 'bowl_out', 'coin_toss', 'organizer'];

function wicketShapeOk(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return (
    isString(value.type) &&
    isString(value.playerOutId) &&
    isStringArray(value.fielderIds) &&
    (value.dismissalEnd === null || isOneOf(CREASE_ENDS, value.dismissalEnd))
  );
}

function deliveryShapeOk(event: UnknownRecord): boolean {
  if (!isOneOf(DELIVERY_CALLS, event.call)) {
    return false;
  }
  if (event.call !== 'wide' && !isOneOf(RUNS_TO, event.runsTo)) {
    return false;
  }
  return isString(event.strikerId) && isNullableString(event.nonStrikerId) && isString(event.bowlerId) && wicketShapeOk(event.wicket);
}

function marginShapeOk(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'runs') {
    return isInt(value.runs);
  }
  return value.kind === 'wickets' && isInt(value.wickets) && isInt(value.ballsRemaining);
}

function outcomeShapeOk(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case 'natural':
      return true;
    case 'tie_decided':
      return isOneOf(TIE_METHODS, value.method) && isString(value.winnerTeamId);
    case 'no_result':
    case 'abandoned':
      return value.reason === undefined || isNullableString(value.reason);
    case 'walkover':
      return isString(value.winnerTeamId) && (value.reason === undefined || isNullableString(value.reason));
    case 'awarded':
      return isNullableString(value.winnerTeamId) && isString(value.reason) && (value.margin === undefined || marginShapeOk(value.margin));
    default:
      return false;
  }
}

function powerplaysShapeOk(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  return Array.isArray(value) && value.every((phase) => isRecord(phase) && isString(phase.name));
}

function absenteesShapeOk(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => isRecord(entry) && isString(entry.playerId) && isBoolean(entry.hurt));
}

function payloadShapeOk(kind: MatchEventKind, event: UnknownRecord): boolean {
  switch (kind) {
    case 'innings_started':
      return isString(event.battingTeamId) && isString(event.strikerId) && isString(event.nonStrikerId) && isString(event.bowlerId);
    case 'delivery':
      return deliveryShapeOk(event);
    case 'batter_in':
      return isString(event.playerId) && isOneOf(POSITIONS, event.position);
    case 'bowler_selected':
      return isString(event.bowlerId) && isString(event.reason);
    case 'strike_swapped':
      return true;
    case 'batter_retired':
      return isString(event.playerId) && isOneOf(RETIREMENT_KINDS, event.retirement);
    case 'batter_dismissed':
      return isString(event.playerId) && isOneOf(OFF_BALL_DISMISSAL_TYPES, event.type) && isStringArray(event.fielderIds);
    case 'penalty_awarded':
      return isString(event.teamId) && (event.reason === undefined || isString(event.reason));
    case 'overs_revised':
      return (
        (event.target === null || typeof event.target === 'number') &&
        (event.maxOversPerBowler === undefined || event.maxOversPerBowler === null || typeof event.maxOversPerBowler === 'number') &&
        (event.bowlerQuotaMode === undefined || isOneOf(QUOTA_MODES, event.bowlerQuotaMode)) &&
        powerplaysShapeOk(event.powerplays) &&
        isBoolean(event.terminal)
      );
    case 'play_suspended':
      return isOneOf(SUSPENSION_REASONS, event.reason) && (event.note === undefined || isNullableString(event.note));
    case 'play_resumed':
      return true;
    case 'innings_ended':
      return (event.reason === 'declared' || event.reason === 'batters_unavailable') && absenteesShapeOk(event.absentees);
    case 'super_over_started':
      return true;
    case 'match_ended':
      return outcomeShapeOk(event.outcome);
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function eventKindOf(event: unknown): MatchEventKind | null {
  if (!isRecord(event)) {
    return null;
  }
  return isOneOf(MATCH_EVENT_KINDS, event.kind) ? event.kind : null;
}

export function hasValidShape(event: unknown): boolean {
  const kind = eventKindOf(event);
  return kind !== null && isRecord(event) && payloadShapeOk(kind, event);
}

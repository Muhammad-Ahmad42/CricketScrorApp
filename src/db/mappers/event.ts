import type {
  BoundaryAllowance,
  CreaseEnd,
  DeliveryCall,
  DeliveryDismissalType,
  DeliveryPayload,
  DeliveryWicket,
  EventEnvelope,
  MatchEvent,
  MatchEventKind,
  MatchEventPayload,
  RunsTo,
} from '@/domain/types';
import { InvalidRowsError } from '../errors';
import { parseJson, required, type SqlRecord } from './values';

export interface EventRow {
  readonly id: string;
  readonly match_id: string;
  readonly seq: number;
  readonly action_id: string;
  readonly kind: MatchEventKind;
  readonly recorded_at: string;
  readonly striker_id: string | null;
  readonly non_striker_id: string | null;
  readonly bowler_id: string | null;
  readonly call: DeliveryCall | null;
  readonly runs_to: RunsTo | null;
  readonly runs_run: number | null;
  readonly short_runs: number | null;
  readonly boundary: number | null;
  readonly wicket_type: DeliveryDismissalType | null;
  readonly dismissed_player_id: string | null;
  readonly fielder_id: string | null;
  readonly fielder2_id: string | null;
  readonly dismissal_end: CreaseEnd | null;
  readonly payload_json: string | null;
}

export const EVENT_COLUMNS =
  'id, match_id, seq, action_id, kind, recorded_at, striker_id, non_striker_id, bowler_id, call, runs_to, runs_run, ' +
  'short_runs, boundary, wicket_type, dismissed_player_id, fielder_id, fielder2_id, dismissal_end, payload_json';

const ENVELOPE_KEYS: ReadonlySet<string> = new Set(['id', 'matchId', 'seq', 'actionId', 'recordedAt', 'kind']);

const EMPTY_DELIVERY_COLUMNS: SqlRecord = {
  striker_id: null,
  non_striker_id: null,
  bowler_id: null,
  call: null,
  runs_to: null,
  runs_run: null,
  short_runs: null,
  boundary: null,
  wicket_type: null,
  dismissed_player_id: null,
  fielder_id: null,
  fielder2_id: null,
  dismissal_end: null,
};

function wicketColumns(wicket: DeliveryWicket | null): SqlRecord {
  if (wicket === null) {
    return { wicket_type: null, dismissed_player_id: null, fielder_id: null, fielder2_id: null, dismissal_end: null };
  }
  if (wicket.fielderIds.length > 2) {
    throw new InvalidRowsError(`A delivery wicket can name at most two fielders (got ${wicket.fielderIds.length}).`);
  }
  return {
    wicket_type: wicket.type,
    dismissed_player_id: wicket.playerOutId,
    fielder_id: wicket.fielderIds[0] ?? null,
    fielder2_id: wicket.fielderIds[1] ?? null,
    dismissal_end: wicket.dismissalEnd,
  };
}

function deliveryColumns(event: DeliveryPayload): SqlRecord {
  return {
    striker_id: event.strikerId,
    non_striker_id: event.nonStrikerId,
    bowler_id: event.bowlerId,
    call: event.call,
    runs_to: event.call === 'wide' ? null : event.runsTo,
    runs_run: event.runsRun,
    short_runs: event.shortRuns,
    boundary: event.boundary,
    ...wicketColumns(event.wicket),
  };
}

function payloadJson(event: MatchEvent): string {
  const entries = Object.entries(event).filter(([key]) => !ENVELOPE_KEYS.has(key));
  return JSON.stringify(Object.fromEntries(entries));
}

export function eventToRecord(event: MatchEvent): SqlRecord {
  const envelope: SqlRecord = {
    id: event.id,
    match_id: event.matchId,
    seq: event.seq,
    action_id: event.actionId,
    kind: event.kind,
    recorded_at: event.recordedAt,
  };
  if (event.kind === 'delivery') {
    return { ...envelope, ...EMPTY_DELIVERY_COLUMNS, ...deliveryColumns(event), payload_json: null };
  }
  return { ...envelope, ...EMPTY_DELIVERY_COLUMNS, payload_json: payloadJson(event) };
}

function toBoundary(value: number | null): BoundaryAllowance {
  if (value === 0 || value === 4 || value === 6) {
    return value;
  }
  throw new InvalidRowsError(`Invalid boundary value ${String(value)}.`);
}

function wicketFromRow(row: EventRow): DeliveryWicket | null {
  if (row.wicket_type === null) {
    return null;
  }
  const fielderIds = [row.fielder_id, row.fielder2_id].filter((id): id is string => id !== null);
  return {
    type: row.wicket_type,
    playerOutId: required(row.dismissed_player_id, 'match_events.dismissed_player_id'),
    fielderIds,
    dismissalEnd: row.dismissal_end,
  };
}

function deliveryFromRow(row: EventRow): DeliveryPayload {
  const common = {
    kind: 'delivery' as const,
    strikerId: required(row.striker_id, 'match_events.striker_id'),
    nonStrikerId: row.non_striker_id,
    bowlerId: required(row.bowler_id, 'match_events.bowler_id'),
    runsRun: required(row.runs_run, 'match_events.runs_run'),
    shortRuns: required(row.short_runs, 'match_events.short_runs'),
    boundary: toBoundary(row.boundary),
    wicket: wicketFromRow(row),
  };
  const call = required(row.call, 'match_events.call');
  if (call === 'wide') {
    return { ...common, call };
  }
  return { ...common, call, runsTo: required(row.runs_to, 'match_events.runs_to') };
}

function payloadFromRow(row: EventRow): MatchEventPayload {
  if (row.kind === 'delivery') {
    return deliveryFromRow(row);
  }
  const body = parseJson<object>(required(row.payload_json, 'match_events.payload_json'));
  return { ...body, kind: row.kind } as MatchEventPayload;
}

export function eventFromRow(row: EventRow): MatchEvent {
  const envelope: EventEnvelope = {
    id: row.id,
    matchId: row.match_id,
    seq: row.seq,
    actionId: row.action_id,
    recordedAt: row.recorded_at,
  };
  return { ...payloadFromRow(row), ...envelope };
}

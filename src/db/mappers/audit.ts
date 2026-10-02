import type { AuditAction, AuditEntityType, AuditEvent, ImpactSummary, JsonValue } from '@/domain/types';
import { parseJsonOrNull, toJsonOrNull, type SqlRecord } from './values';

export interface AuditRow {
  readonly id: string;
  readonly tournament_id: string | null;
  readonly match_id: string | null;
  readonly action: AuditAction;
  readonly entity_type: AuditEntityType;
  readonly entity_id: string;
  readonly summary: string;
  readonly previous_json: string | null;
  readonly new_json: string | null;
  readonly reason: string | null;
  readonly impact_json: string | null;
  readonly created_at: string;
}

export const AUDIT_COLUMNS =
  'id, tournament_id, match_id, action, entity_type, entity_id, summary, previous_json, new_json, reason, impact_json, created_at';

export function auditFromRow(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    matchId: row.match_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    previousValue: parseJsonOrNull<JsonValue>(row.previous_json),
    newValue: parseJsonOrNull<JsonValue>(row.new_json),
    reason: row.reason,
    impact: parseJsonOrNull<ImpactSummary>(row.impact_json),
    createdAt: row.created_at,
  };
}

export function auditToRecord(event: AuditEvent): SqlRecord {
  return {
    id: event.id,
    tournament_id: event.tournamentId,
    match_id: event.matchId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    summary: event.summary,
    previous_json: toJsonOrNull(event.previousValue),
    new_json: toJsonOrNull(event.newValue),
    reason: event.reason,
    impact_json: toJsonOrNull(event.impact),
    created_at: event.createdAt,
  };
}

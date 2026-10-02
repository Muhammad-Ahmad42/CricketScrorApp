import type { AuditAction, AuditEvent, JsonValue } from '@/domain/types';
import { formatDate } from './dates';

export type AuditFilter = 'all' | 'results' | 'teams' | 'fixtures' | 'overrides' | 'rules';

const FILTER_ACTIONS: { readonly [K in Exclude<AuditFilter, 'all'>]: readonly AuditAction[] } = {
  results: ['result_recorded', 'result_corrected', 'match_reopened', 'match_history_edited', 'match_started'],
  teams: ['team_added', 'team_removed', 'team_withdrawn', 'team_moved', 'team_swapped', 'team_replaced', 'team_seed_changed', 'pools_generated', 'pools_replaced'],
  fixtures: ['fixtures_generated', 'fixture_created', 'fixture_changed', 'fixture_rescheduled', 'fixture_status_changed', 'fixture_deleted'],
  overrides: ['override_applied', 'override_revoked'],
  rules: ['rules_changed', 'stage_created', 'stage_changed', 'stage_deleted', 'slot_changed', 'tournament_info_changed', 'tournament_status_changed'],
};

export const AUDIT_FILTERS: readonly { readonly value: AuditFilter; readonly label: string }[] = [
  { value: 'all', label: 'All changes' },
  { value: 'results', label: 'Results' },
  { value: 'teams', label: 'Teams & pools' },
  { value: 'fixtures', label: 'Fixtures' },
  { value: 'overrides', label: 'Overrides' },
  { value: 'rules', label: 'Rules & stages' },
];

export interface AuditRowVM {
  readonly key: string;
  readonly day: string;
  readonly time: string;
  readonly summary: string;
  readonly change: string | null;
  readonly reason: string | null;
  readonly event: AuditEvent;
}

function valueText(value: JsonValue | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localStamp(iso: string): { readonly day: string; readonly time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { day: iso.slice(0, 10), time: '' };
  }
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function filterAudit(events: readonly AuditEvent[], filter: AuditFilter): readonly AuditEvent[] {
  if (filter === 'all') {
    return events;
  }
  const actions = FILTER_ACTIONS[filter];
  return events.filter((event) => actions.includes(event.action));
}

export function auditRow(event: AuditEvent): AuditRowVM {
  const before = valueText(event.previousValue);
  const after = valueText(event.newValue);
  const stamp = localStamp(event.createdAt);
  return {
    key: event.id,
    day: (formatDate(stamp.day) ?? stamp.day).toUpperCase(),
    time: stamp.time,
    summary: event.summary,
    change: before !== null || after !== null ? `${before ?? '–'} → ${after ?? '–'}` : null,
    reason: event.reason,
    event,
  };
}

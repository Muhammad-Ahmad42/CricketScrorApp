import type { ImpactSummary } from './impact';
import type { Id, IsoDateTime, JsonValue, MatchId, TournamentId } from './primitives';

export const AUDIT_ACTIONS = [
  'tournament_created',
  'tournament_info_changed',
  'tournament_status_changed',
  'rules_changed',
  'team_added',
  'team_removed',
  'team_withdrawn',
  'team_moved',
  'team_swapped',
  'team_replaced',
  'team_seed_changed',
  'pools_generated',
  'pools_replaced',
  'stage_created',
  'stage_changed',
  'stage_deleted',
  'slot_changed',
  'fixtures_generated',
  'fixture_created',
  'fixture_changed',
  'fixture_rescheduled',
  'fixture_status_changed',
  'fixture_deleted',
  'match_started',
  'result_recorded',
  'result_corrected',
  'match_reopened',
  'match_history_edited',
  'match_rules_changed',
  'match_toss_changed',
  'match_squad_changed',
  'match_deleted',
  'override_applied',
  'override_revoked',
  'backup_imported',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType =
  | 'tournament'
  | 'rules'
  | 'team'
  | 'stage'
  | 'pool'
  | 'slot'
  | 'fixture'
  | 'match'
  | 'override'
  | 'backup'
  | 'app';

export interface AuditEvent {
  readonly id: Id;
  readonly tournamentId: TournamentId | null;
  readonly matchId: MatchId | null;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: Id;
  readonly summary: string;
  readonly previousValue: JsonValue | null;
  readonly newValue: JsonValue | null;
  readonly reason: string | null;
  readonly impact: ImpactSummary | null;
  readonly createdAt: IsoDateTime;
}

import type { AuditEvent } from './audit';
import type { TournamentOverride, TournamentRules } from './competition';
import type { MatchEvent } from './events';
import type { Match, MatchPlayer } from './match';
import type { Id, IsoDateTime, MatchId, TournamentId } from './primitives';
import type { FormatPreset } from './rules';
import type { AppSettings } from './settings';
import type { Player, Team, Venue } from './team';
import type { TournamentTemplate } from './template';
import type { Fixture, Pool, PoolEntry, Stage, StageSlot, Tournament, TournamentTeam } from './tournament';

export const BACKUP_FORMAT = 'scorebook-backup' as const;
export const BACKUP_FORMAT_VERSION = 1;

export type BackupScope =
  | { readonly kind: 'full' }
  | { readonly kind: 'tournament'; readonly tournamentId: TournamentId }
  | { readonly kind: 'match'; readonly matchId: MatchId };

export interface BackupData {
  readonly venues: readonly Venue[];
  readonly teams: readonly Team[];
  readonly players: readonly Player[];
  readonly tournaments: readonly Tournament[];
  readonly tournamentRules: readonly TournamentRules[];
  readonly tournamentTeams: readonly TournamentTeam[];
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly poolEntries: readonly PoolEntry[];
  readonly fixtures: readonly Fixture[];
  readonly matches: readonly Match[];
  readonly matchPlayers: readonly Omit<MatchPlayer, 'name' | 'jerseyNumber' | 'role'>[];
  readonly matchEvents: readonly MatchEvent[];
  readonly overrides: readonly TournamentOverride[];
  readonly auditEvents: readonly AuditEvent[];
  readonly templates: readonly TournamentTemplate[];
  readonly formatPresets: readonly FormatPreset[];
  readonly settings: AppSettings | null;
}

export interface BackupEnvelope {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly exportId: string;
  readonly schemaVersion: number;
  readonly exportedAt: IsoDateTime;
  readonly app: { readonly name: 'Scorebook'; readonly version: string; readonly platform: string | null };
  readonly scope: BackupScope;
  readonly counts: { readonly [K in keyof BackupData]: number };
  readonly checksum: string | null;
  readonly data: BackupData;
}

export const BACKUP_ISSUE_CODES = [
  'INVALID_JSON',
  'INVALID_FORMAT',
  'UNSUPPORTED_FORMAT_VERSION',
  'SCHEMA_TOO_NEW',
  'CHECKSUM_MISMATCH',
  'CHECKSUM_MISSING',
  'INVALID_VALUE',
  'DUPLICATE_ID',
  'MISSING_REFERENCE',
  'INVALID_EVENT_LOG',
  'ID_CONFLICT',
] as const;
export type BackupIssueCode = (typeof BACKUP_ISSUE_CODES)[number];

export interface BackupIssue {
  readonly severity: 'error' | 'warning';
  readonly code: BackupIssueCode;
  readonly message: string;
  readonly path: string | null;
}

export type ImportAggregateKind = 'tournament' | 'match' | 'team' | 'player' | 'venue' | 'template' | 'preset';

export type ImportConflictPolicy = 'skip_existing' | 'import_as_copy' | 'replace_existing';

export interface ImportConflict {
  readonly entity: ImportAggregateKind;
  readonly id: Id;
  readonly label: string;
  readonly localOnly: { readonly matches: number; readonly events: number };
}

export interface ImportSource {
  readonly exportId: string;
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly exportedAt: IsoDateTime;
  readonly appVersion: string;
  readonly platform: string | null;
  readonly title?: string | null;
}

export interface ImportPreview {
  readonly ok: boolean;
  readonly previouslyImportedAt: IsoDateTime | null;
  readonly issues: readonly BackupIssue[];
  readonly conflicts: readonly ImportConflict[];
  readonly counts: { readonly [K in keyof BackupData]: number };
  readonly scope: BackupScope;
  readonly source?: ImportSource | null;
}

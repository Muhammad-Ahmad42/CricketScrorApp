import type {
  AppSettings,
  BackupIssue,
  ImportConflict,
  ImportPreview,
  ImportSource,
  TournamentListItem,
} from '@/domain/types';
import type { BootstrapReport, ImportReport, IntegrityReport, ServiceError } from '@/services/contracts';

export function appSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'system',
    hapticsEnabled: true,
    soundEnabled: false,
    reducedMotion: 'system',
    defaultFormatId: 'T20',
    scoring: { confirmInningsEnd: false, autoPromptBowler: true, dotStyle: 'zero', keepAwake: true },
    ...overrides,
  };
}

export type Counts = ImportPreview['counts'];

export function counts(overrides: Partial<Counts> = {}): Counts {
  return {
    venues: 0,
    teams: 0,
    players: 0,
    tournaments: 0,
    tournamentRules: 0,
    tournamentTeams: 0,
    stages: 0,
    pools: 0,
    slots: 0,
    poolEntries: 0,
    fixtures: 0,
    matches: 0,
    matchPlayers: 0,
    matchEvents: 0,
    overrides: 0,
    auditEvents: 0,
    templates: 0,
    formatPresets: 0,
    settings: 0,
    ...overrides,
  };
}

export function issue(severity: BackupIssue['severity'], code: BackupIssue['code'], message: string): BackupIssue {
  return { severity, code, message, path: 'data.matches[0]' };
}

export function conflict(overrides: Partial<ImportConflict> = {}): ImportConflict {
  return {
    entity: 'tournament',
    id: 'tour-1',
    label: 'City Cup 2026',
    localOnly: { matches: 0, events: 0 },
    ...overrides,
  };
}

export function importSource(overrides: Partial<ImportSource> = {}): ImportSource {
  return {
    exportId: 'export-1',
    formatVersion: 1,
    schemaVersion: 1,
    exportedAt: '2026-09-28T12:00:00.000Z',
    appVersion: '1.0.0',
    platform: 'android',
    ...overrides,
  };
}

export function importPreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    ok: true,
    previouslyImportedAt: null,
    issues: [],
    conflicts: [],
    counts: counts({ tournaments: 1, matches: 24, teams: 8, players: 96, fixtures: 28, matchEvents: 4210, venues: 2 }),
    scope: { kind: 'tournament', tournamentId: 'tour-1' },
    ...overrides,
  };
}

export function importReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    imported: { tournament: 1, match: 24 },
    skipped: { team: 2 },
    rebuiltMatches: 0,
    ...overrides,
  };
}

export function serviceError(overrides: Partial<ServiceError> = {}): ServiceError {
  return {
    code: 'STORAGE',
    message: "Couldn't save the backup. Your data is safe.",
    domainCode: null,
    detail: null,
    ...overrides,
  };
}

export function bootstrapReport(overrides: Partial<BootstrapReport> = {}): BootstrapReport {
  return {
    schemaVersion: 1,
    resumable: [],
    projectionsRebuilt: 0,
    integrityIssues: [],
    pragmas: { foreignKeys: 1, journalMode: 'wal', synchronous: 2 },
    ...overrides,
  };
}

export function integrityReport(overrides: Partial<IntegrityReport> = {}): IntegrityReport {
  return {
    checkedAt: '2026-09-30T12:15:00.000Z',
    foreignKeyViolations: 0,
    matchesNeedingRepair: [],
    ...overrides,
  };
}

export function tournamentItem(overrides: Partial<TournamentListItem> = {}): TournamentListItem {
  return {
    id: 'tour-1',
    name: 'City Cup',
    season: '2026',
    status: 'active',
    teamCount: 8,
    fixturesDone: 24,
    fixturesTotal: 48,
    championName: null,
    startDate: '2026-09-01',
    endDate: null,
    updatedAt: '2026-09-30T12:00:00.000Z',
    ...overrides,
  };
}

export const BACKUP_URI = 'file:///cache/exports/scorebook-backup-2026-09-30.json';
export const PICKED_URI = 'file:///cache/DocumentPicker/city-cup.json';

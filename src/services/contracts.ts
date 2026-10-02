import type {
  AppSettings,
  AuditEvent,
  BackupEnvelope,
  BackupScope,
  FixtureId,
  FixturePatch,
  HypotheticalResult,
  Id,
  ImpactSummary,
  ImportConflictPolicy,
  ImportPreview,
  IsoDateTime,
  Match,
  MatchEndOutcome,
  MatchEvent,
  MatchEventInput,
  MatchId,
  MatchPlayer,
  MatchRules,
  MatchSetup,
  MatchState,
  NewMatchInput,
  NewPlayerInput,
  NewTeamInput,
  Player,
  PlayerId,
  Pool,
  ProposedChange,
  Seed,
  Seq,
  Stage,
  StageId,
  StageSlot,
  Team,
  TeamId,
  Toss,
  Tournament,
  TournamentEvaluation,
  TournamentId,
  TournamentOverride,
  TournamentRules,
  TournamentSnapshot,
  TournamentStats,
  TournamentStatus,
  TournamentStructureKind,
  TournamentTemplate,
  ValidationWarning,
  Venue,
  WhatIfResult,
  FixtureDraft,
  PoolEntry,
  SlotId,
} from '@/domain/types';
import type { IdGenerator, PoolId } from '@/domain/types';
import type { EditOutcome, HistoryEditOp } from '@/domain/scoring/history';
import type { PoolAssignment } from '@/domain/tournament/pools';
import type { MatchListItem, MatchListQuery, TournamentListItem } from '@/domain/types';
import type { SqlDatabase } from '@/db/types';

export interface Clock {
  now(): IsoDateTime;
}

export type ServiceErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN_STATE'
  | 'CONFIRMATION_REQUIRED'
  | 'STORAGE'
  | 'IMPORT_INVALID'
  | 'EXPORT_FAILED';

export interface ServiceError {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly domainCode: string | null;
  readonly detail: string | null;
}

export type ServiceResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ServiceError };

export interface LiveMatch {
  readonly match: Match;
  readonly setup: MatchSetup;
  readonly events: readonly MatchEvent[];
  readonly state: MatchState;
}

export interface HistoryEditPreview {
  readonly outcome: Extract<EditOutcome, { readonly ok: true }>;
  readonly baseFingerprint: string;
  readonly impact: ImpactSummary | null;
  readonly requiresReason: boolean;
}

export interface MatchService {
  createMatch(input: NewMatchInput, openingEvents?: readonly MatchEventInput[]): Promise<ServiceResult<LiveMatch>>;
  load(matchId: MatchId): Promise<ServiceResult<LiveMatch>>;
  record(
    matchId: MatchId,
    expectedLastSeq: Seq,
    events: readonly MatchEventInput[],
  ): Promise<ServiceResult<{ readonly events: readonly MatchEvent[]; readonly state: MatchState; readonly warnings: readonly ValidationWarning[] }>>;
  undo(matchId: MatchId, expectedLastSeq: Seq, reason?: string): Promise<ServiceResult<{ readonly live: LiveMatch; readonly undone: readonly MatchEvent[] }>>;
  redo(matchId: MatchId, expectedLastSeq: Seq, group: readonly MatchEvent[], reason?: string): Promise<ServiceResult<LiveMatch>>;
  previewHistoryEdit(matchId: MatchId, ops: readonly HistoryEditOp[]): Promise<ServiceResult<HistoryEditPreview>>;
  applyHistoryEdit(
    matchId: MatchId,
    ops: readonly HistoryEditOp[],
    reason: string | null,
    expectedFingerprint: string,
  ): Promise<ServiceResult<LiveMatch>>;
  updateDetails(
    matchId: MatchId,
    patch: { readonly title?: string; readonly venueId?: string | null; readonly scheduledDate?: string | null; readonly scheduledTime?: string | null },
  ): Promise<ServiceResult<Match>>;
  updateRules(
    matchId: MatchId,
    patch: {
      readonly rules?: MatchRules;
      readonly teamSizes?: { readonly teamAPlayers: number | null; readonly teamBPlayers: number | null };
    },
    reason: string | null,
  ): Promise<ServiceResult<LiveMatch>>;
  setToss(matchId: MatchId, toss: Toss | null, reason: string | null): Promise<ServiceResult<Match>>;
  addSquadPlayer(
    matchId: MatchId,
    teamId: TeamId,
    player: { readonly playerId: PlayerId } | { readonly newPlayer: NewPlayerInput },
    opts?: { readonly isSubstitute?: boolean },
  ): Promise<ServiceResult<MatchPlayer>>;
  removeSquadPlayer(matchId: MatchId, playerId: PlayerId): Promise<ServiceResult<void>>;
  setPrePlayStatus(matchId: MatchId, status: 'scheduled' | 'postponed' | 'cancelled', reason: string | null): Promise<ServiceResult<Match>>;
  endMatch(matchId: MatchId, expectedLastSeq: Seq, outcome: MatchEndOutcome, reason: string | null): Promise<ServiceResult<LiveMatch>>;
  discard(matchId: MatchId): Promise<ServiceResult<void>>;
  dismissResume(matchId: MatchId): Promise<ServiceResult<void>>;
  delete(matchId: MatchId): Promise<ServiceResult<void>>;
  list(query: MatchListQuery): Promise<ServiceResult<readonly MatchListItem[]>>;
  findResumable(opts?: { readonly forPrompt?: boolean }): Promise<ServiceResult<readonly MatchListItem[]>>;
  rebuildProjections(matchId: MatchId): Promise<ServiceResult<void>>;
  auditLog(matchId: MatchId, page: AuditPage): Promise<ServiceResult<readonly AuditEvent[]>>;
}

export interface AuditPage {
  readonly limit: number;
  readonly before?: IsoDateTime;
}

export type MatchDetailsPatch = Parameters<MatchService['updateDetails']>[1];

export type MatchRulesPatch = Parameters<MatchService['updateRules']>[1];

export type PrePlayStatus = Parameters<MatchService['setPrePlayStatus']>[1];

export interface TeamService {
  list(opts?: { readonly includeArchived?: boolean; readonly search?: string }): Promise<ServiceResult<readonly Team[]>>;
  get(teamId: TeamId): Promise<ServiceResult<{ readonly team: Team; readonly players: readonly Player[] }>>;
  create(input: NewTeamInput): Promise<ServiceResult<Team>>;
  update(team: Team): Promise<ServiceResult<Team>>;
  archive(teamId: TeamId): Promise<ServiceResult<void>>;
  addPlayer(teamId: TeamId, input: NewPlayerInput): Promise<ServiceResult<Player>>;
  updatePlayer(player: Player): Promise<ServiceResult<Player>>;
  archivePlayer(playerId: PlayerId): Promise<ServiceResult<void>>;
  listVenues(): Promise<ServiceResult<readonly Venue[]>>;
  createVenue(input: { readonly name: string; readonly location: string | null }): Promise<ServiceResult<Venue>>;
  archiveVenue(venueId: Id): Promise<ServiceResult<void>>;
}

export interface NewTournamentInput {
  readonly name: string;
  readonly season: string | null;
  readonly description: string | null;
  readonly organizer: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly venueIds: readonly Id[];
  readonly structureKind: TournamentStructureKind;
  readonly templateId: string | null;
}

export interface FixturePlan {
  readonly fixtures: readonly FixtureDraft[];
  readonly slots: readonly StageSlot[];
  readonly entrySlotSeeds: readonly { readonly slotId: SlotId; readonly seed: number }[];
  readonly seed: Seed | null;
}

export type PoolAssignmentMethod =
  | { readonly kind: 'random'; readonly seed: Seed | null }
  | { readonly kind: 'seeded' }
  | { readonly kind: 'from_slots'; readonly pattern: 'snake' | 'fixed_order' }
  | { readonly kind: 'manual'; readonly assignment: PoolAssignment };

export interface ChangePreview {
  readonly impact: ImpactSummary;
  readonly version: string;
}

export interface TournamentService {
  create(input: NewTournamentInput): Promise<ServiceResult<Tournament>>;
  list(opts?: { readonly statuses?: readonly TournamentStatus[]; readonly search?: string }): Promise<ServiceResult<readonly TournamentListItem[]>>;
  snapshot(tournamentId: TournamentId): Promise<ServiceResult<TournamentSnapshot>>;
  evaluate(tournamentId: TournamentId): Promise<ServiceResult<{ readonly snapshot: TournamentSnapshot; readonly evaluation: TournamentEvaluation }>>;
  updateInfo(tournamentId: TournamentId, patch: Partial<Omit<Tournament, 'id' | 'status' | 'createdAt' | 'updatedAt'>>): Promise<ServiceResult<Tournament>>;
  addTeams(
    tournamentId: TournamentId,
    teams: readonly { readonly teamId: TeamId; readonly seed: number | null }[],
  ): Promise<ServiceResult<TournamentSnapshot>>;
  removeTeams(tournamentId: TournamentId, teamIds: readonly TeamId[]): Promise<ServiceResult<TournamentSnapshot>>;
  saveStructure(
    tournamentId: TournamentId,
    structure: {
      readonly rules: TournamentRules;
      readonly stages: readonly Stage[];
      readonly pools: readonly Pool[];
      readonly slots: readonly StageSlot[];
      readonly poolEntries: readonly PoolEntry[];
    },
  ): Promise<ServiceResult<TournamentSnapshot>>;
  previewPoolAssignment(stageId: StageId, method: PoolAssignmentMethod): Promise<ServiceResult<PoolAssignment>>;
  generateFixtures(stageId: StageId, opts?: { readonly poolId?: string | null; readonly seed?: Seed }): Promise<ServiceResult<FixturePlan>>;
  confirmFixtures(stageId: StageId, plan: FixturePlan): Promise<ServiceResult<TournamentSnapshot>>;
  addFixture(draft: FixtureDraft): Promise<ServiceResult<TournamentSnapshot>>;
  previewChange(tournamentId: TournamentId, change: ProposedChange): Promise<ServiceResult<ChangePreview>>;
  applyChange(
    tournamentId: TournamentId,
    change: ProposedChange,
    reason: string | null,
    confirmation: ChangePreview,
  ): Promise<ServiceResult<TournamentSnapshot>>;
  updateFixture(fixtureId: FixtureId, patch: FixturePatch, reason: string | null): Promise<ServiceResult<TournamentSnapshot>>;
  startFixtureMatch(
    fixtureId: FixtureId,
    setup: {
      readonly squads: NewMatchInput['squads'];
      readonly toss: Toss | null;
      readonly rules?: MatchRules;
      readonly teamAPlayers?: number | null;
      readonly teamBPlayers?: number | null;
    },
    openingEvents?: readonly MatchEventInput[],
  ): Promise<ServiceResult<Match>>;
  applyOverride(tournamentId: TournamentId, override: TournamentOverride, expectedVersion: string): Promise<ServiceResult<TournamentSnapshot>>;
  revokeOverride(tournamentId: TournamentId, overrideId: string, reason: string | null, expectedVersion: string): Promise<ServiceResult<TournamentSnapshot>>;
  setStatus(tournamentId: TournamentId, to: TournamentStatus, reason: string | null): Promise<ServiceResult<Tournament>>;
  whatIf(tournamentId: TournamentId, hypotheticals: readonly HypotheticalResult[]): Promise<ServiceResult<WhatIfResult>>;
  stats(tournamentId: TournamentId): Promise<ServiceResult<TournamentStats>>;
  auditLog(tournamentId: TournamentId, page: { readonly limit: number; readonly before?: IsoDateTime }): Promise<ServiceResult<readonly AuditEvent[]>>;
  listTemplates(): Promise<ServiceResult<readonly TournamentTemplate[]>>;
  saveAsTemplate(tournamentId: TournamentId, meta: { readonly name: string; readonly description: string }): Promise<ServiceResult<TournamentTemplate>>;
  previewDelete(tournamentId: TournamentId): Promise<ServiceResult<{ readonly matches: number; readonly completedMatches: number; readonly events: number }>>;
  delete(
    tournamentId: TournamentId,
    confirm: { readonly typedName: string; readonly deleteCompletedMatches: boolean },
  ): Promise<ServiceResult<void>>;
}

export type TournamentInfoPatch = Parameters<TournamentService['updateInfo']>[1];

export type FixtureMatchSetup = Parameters<TournamentService['startFixtureMatch']>[1];

export interface TournamentDeletePreview {
  readonly matches: number;
  readonly completedMatches: number;
  readonly events: number;
}

export interface TournamentDeleteConfirmation {
  readonly typedName: string;
  readonly deleteCompletedMatches: boolean;
}

export interface GenerateFixturesOptions {
  readonly poolId?: PoolId | null;
  readonly seed?: Seed;
}

export interface ImportReport {
  readonly imported: { readonly [entity: string]: number };
  readonly skipped: { readonly [entity: string]: number };
  readonly rebuiltMatches: number;
}

export interface BackupService {
  exportBackup(scope: BackupScope): Promise<ServiceResult<{ readonly fileUri: string; readonly envelope: BackupEnvelope }>>;
  previewImport(fileUri: string): Promise<ServiceResult<ImportPreview>>;
  applyImport(fileUri: string, policy: ImportConflictPolicy): Promise<ServiceResult<ImportReport>>;
}

export interface ExportService {
  scorecardPdf(matchId: MatchId): Promise<ServiceResult<{ readonly fileUri: string }>>;
  tournamentPdf(tournamentId: TournamentId): Promise<ServiceResult<{ readonly fileUri: string }>>;
  share(fileUri: string, mimeType: 'application/pdf' | 'application/json'): Promise<ServiceResult<void>>;
}

export interface SettingsService {
  load(): Promise<ServiceResult<AppSettings>>;
  update(patch: Partial<AppSettings>): Promise<ServiceResult<AppSettings>>;
}

export interface DatabasePragmas {
  readonly foreignKeys: number;
  readonly journalMode: string;
  readonly synchronous: number;
}

export interface BootstrapReport {
  readonly schemaVersion: number;
  readonly resumable: readonly MatchListItem[];
  readonly projectionsRebuilt: number;
  readonly integrityIssues: readonly { readonly matchId: MatchId; readonly message: string }[];
  readonly pragmas?: DatabasePragmas | null;
}

export interface IntegrityReport {
  readonly checkedAt: IsoDateTime;
  readonly foreignKeyViolations: number;
  readonly matchesNeedingRepair: readonly MatchId[];
}

export interface AppServices {
  readonly matches: MatchService;
  readonly teams: TeamService;
  readonly tournaments: TournamentService;
  readonly backup: BackupService;
  readonly export: ExportService;
  readonly settings: SettingsService;
  bootstrap(): Promise<ServiceResult<BootstrapReport>>;
  newId(): Id;
  checkIntegrity(): Promise<ServiceResult<IntegrityReport>>;
}

export interface FileSystemAdapter {
  readonly cacheDirectory: string;
  writeText(fileUri: string, text: string): Promise<void>;
  readText(fileUri: string): Promise<string>;
  move(fromUri: string, toUri: string): Promise<void>;
  remove(fileUri: string): Promise<void>;
}

export interface PrintAdapter {
  printToFile(html: string): Promise<string>;
}

export type ShareMimeType = 'application/pdf' | 'application/json';

export interface ShareAdapter {
  isAvailable(): Promise<boolean>;
  share(fileUri: string, options: { readonly mimeType: ShareMimeType; readonly dialogTitle: string }): Promise<void>;
}

export interface ServiceDeps {
  readonly openDatabase: () => Promise<SqlDatabase>;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly newSeed: () => Seed;
  readonly fileSystem: FileSystemAdapter;
  readonly printer: PrintAdapter;
  readonly sharer: ShareAdapter;
}

export type CreateAppServices = (deps: ServiceDeps) => AppServices;

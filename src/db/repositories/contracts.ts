import type {
  AppSettings,
  AuditEvent,
  BackupData,
  BackupScope,
  BallCount,
  Fixture,
  FormatPreset,
  InningsLine,
  IsoDateTime,
  Match,
  MatchEvent,
  MatchId,
  MatchListItem,
  MatchListQuery,
  MatchResult,
  MatchSetup,
  MatchSquadEntry,
  MatchStatus,
  MatchSummary,
  OverrideId,
  Partnership,
  Player,
  PlayerId,
  Pool,
  PoolEntry,
  Runs,
  Seq,
  Stage,
  StageId,
  StageSlot,
  Team,
  TeamId,
  Tournament,
  TournamentListItem,
  TournamentId,
  TournamentOverride,
  TournamentRules,
  TournamentSnapshot,
  TournamentStatus,
  TournamentTeam,
  TournamentTemplate,
  Venue,
  ExtrasBreakdown,
  ChangePlan,
  Id,
  ImportAggregateKind,
} from '@/domain/types';
import type { SqlExecutor } from '../types';

export type { InningsLine, MatchListItem, MatchListQuery, TournamentListItem } from '@/domain/types';

export interface MatchProjection {
  readonly matchId: MatchId;
  readonly projectionVersion: number;
  readonly status: MatchStatus;
  readonly result: MatchResult | null;
  readonly winnerTeamId: TeamId | null;
  readonly summary: MatchSummary | null;
  readonly startedAt: IsoDateTime | null;
  readonly completedAt: IsoDateTime | null;
  readonly innings: readonly (InningsLine & {
    readonly superOverRound: number | null;
    readonly bowlingTeamId: TeamId;
    readonly maxBalls: BallCount;
    readonly target: Runs | null;
    readonly targetRevised: boolean;
    readonly extras: ExtrasBreakdown;
  })[];
  readonly partnerships: readonly (Partnership & { readonly inningsIndex: number })[];
  readonly updatedAt: IsoDateTime;
}

export interface TeamRepository {
  list(opts?: { readonly includeArchived?: boolean; readonly search?: string }): Promise<Team[]>;
  get(id: TeamId): Promise<Team | null>;
  insert(team: Team): Promise<void>;
  update(team: Team): Promise<void>;
  delete(id: TeamId): Promise<void>;
}

export interface PlayerRepository {
  listByTeam(teamId: TeamId, opts?: { readonly includeArchived?: boolean }): Promise<Player[]>;
  getMany(ids: readonly PlayerId[]): Promise<Player[]>;
  insert(player: Player): Promise<void>;
  update(player: Player): Promise<void>;
  delete(id: PlayerId): Promise<void>;
}

export interface VenueRepository {
  list(opts?: { readonly includeArchived?: boolean }): Promise<Venue[]>;
  get(id: string): Promise<Venue | null>;
  insert(venue: Venue): Promise<void>;
  update(venue: Venue): Promise<void>;
  archive(id: string, at: IsoDateTime): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface MatchRepository {
  get(id: MatchId): Promise<Match | null>;
  getSetup(id: MatchId): Promise<MatchSetup | null>;
  isSuperseded(id: MatchId): Promise<boolean>;
  insert(match: Match, squads: readonly { readonly teamId: TeamId; readonly players: readonly MatchSquadEntry[] }[]): Promise<void>;
  update(match: Match): Promise<void>;
  addSquadPlayer(matchId: MatchId, teamId: TeamId, entry: MatchSquadEntry): Promise<void>;
  removeSquadPlayer(matchId: MatchId, playerId: PlayerId): Promise<void>;
  list(query: MatchListQuery): Promise<MatchListItem[]>;
  findResumable(opts?: { readonly forPrompt?: boolean }): Promise<MatchListItem[]>;
  setResumeDismissed(matchId: MatchId, at: IsoDateTime | null): Promise<void>;
  listStaleProjections(version: number): Promise<MatchId[]>;
  writeProjection(projection: MatchProjection): Promise<void>;
  delete(id: MatchId): Promise<void>;
}

export interface MatchEventRepository {
  listByMatch(matchId: MatchId): Promise<MatchEvent[]>;
  lastSeq(matchId: MatchId): Promise<Seq>;
  append(events: readonly MatchEvent[]): Promise<void>;
  truncateFrom(matchId: MatchId, fromSeq: Seq, expectedLastSeq: Seq): Promise<number>;
  replaceAll(matchId: MatchId, events: readonly MatchEvent[]): Promise<void>;
}

export interface TournamentRepository {
  list(opts?: { readonly statuses?: readonly TournamentStatus[]; readonly search?: string }): Promise<TournamentListItem[]>;
  getSnapshot(id: TournamentId, projectionVersion: number): Promise<TournamentSnapshot | null>;
  insert(tournament: Tournament, rules: TournamentRules): Promise<void>;
  update(tournament: Tournament): Promise<void>;
  updateRules(rules: TournamentRules): Promise<void>;
  bumpRevision(id: TournamentId): Promise<number>;
  writeChampion(id: TournamentId, teamIds: readonly TeamId[] | null): Promise<void>;
  deletionFootprint(id: TournamentId): Promise<{ readonly matches: number; readonly completedMatches: number; readonly events: number }>;
  listMatchIds(id: TournamentId): Promise<MatchId[]>;
  delete(id: TournamentId): Promise<void>;
  applyPlanRows(tournamentId: TournamentId, plan: ChangePlan, at: IsoDateTime): Promise<void>;
  upsertTournamentTeams(rows: readonly TournamentTeam[]): Promise<void>;
  deleteTournamentTeam(id: string): Promise<void>;
  upsertStages(stages: readonly Stage[]): Promise<void>;
  deleteStage(id: StageId): Promise<void>;
  upsertPools(pools: readonly Pool[]): Promise<void>;
  deletePool(id: string): Promise<void>;
  replacePoolEntries(stageId: StageId, entries: readonly PoolEntry[]): Promise<void>;
  upsertSlots(slots: readonly StageSlot[]): Promise<void>;
  deleteSlot(id: string): Promise<void>;
  insertFixtures(fixtures: readonly Fixture[]): Promise<void>;
  updateFixture(fixture: Fixture): Promise<void>;
  deleteFixture(id: string): Promise<void>;
  insertOverride(override: TournamentOverride): Promise<void>;
  revokeOverride(id: OverrideId, at: IsoDateTime, reason: string | null): Promise<void>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  list(query: {
    readonly tournamentId?: TournamentId;
    readonly matchId?: MatchId;
    readonly limit: number;
    readonly before?: IsoDateTime;
  }): Promise<AuditEvent[]>;
}

export interface SettingsRepository {
  getAll(): Promise<Partial<AppSettings>>;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K], at: IsoDateTime): Promise<void>;
}

export interface TemplateRepository {
  list(): Promise<TournamentTemplate[]>;
  get(id: string): Promise<TournamentTemplate | null>;
  upsert(template: TournamentTemplate): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface FormatPresetRepository {
  list(): Promise<FormatPreset[]>;
  upsert(preset: FormatPreset, at: IsoDateTime): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BackupRepository {
  exportData(scope: BackupScope): Promise<BackupData>;
  importData(data: BackupData, mode: { readonly libraryConflict: 'keep_local' | 'update_local' }): Promise<void>;
  deleteAggregate(entity: 'tournament' | 'match', id: Id): Promise<void>;
  aggregateFootprint(entity: 'tournament' | 'match', id: Id): Promise<{ readonly matchIds: readonly MatchId[]; readonly events: number }>;
  existingIds(entity: ImportAggregateKind, ids: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface Repositories {
  readonly teams: TeamRepository;
  readonly players: PlayerRepository;
  readonly venues: VenueRepository;
  readonly matches: MatchRepository;
  readonly events: MatchEventRepository;
  readonly tournaments: TournamentRepository;
  readonly audit: AuditRepository;
  readonly settings: SettingsRepository;
  readonly templates: TemplateRepository;
  readonly presets: FormatPresetRepository;
  readonly backup: BackupRepository;
}

export type CreateRepositories = (db: SqlExecutor) => Repositories;

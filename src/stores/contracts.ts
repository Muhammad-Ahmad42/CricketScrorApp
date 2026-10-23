import type {
  AppSettings,
  FixtureId,
  FormatId,
  IsoDate,
  LocalTime,
  MatchId,
  MatchRules,
  NewPlayerInput,
  PlayerId,
  ProposedChange,
  TeamId,
  Toss,
  TournamentEvaluation,
  TournamentId,
  TournamentSnapshot,
  ValidationWarning,
  VenueId,
} from '@/domain/types';
import type { Pool, Stage, StageSlot, TournamentRules } from '@/domain/types';
import type {
  AuditEvent,
  BackupScope,
  FixtureDraft,
  FixturePatch,
  HypotheticalResult,
  ImportConflictPolicy,
  ImportPreview,
  NewTeamInput,
  Player,
  StageId,
  Team,
  TournamentStats,
  TournamentStatus,
  TournamentTemplate,
  Venue,
  WhatIfResult,
} from '@/domain/types';
import type { ScoringIntent } from '@/domain/scoring/commands';
import type { HistoryEditOp, RedoStack } from '@/domain/scoring/history';
import type { EditConflict } from '@/domain/scoring/editPlanning';
import type { PoolAssignment } from '@/domain/tournament/pools';
import type { MatchListItem, MatchListQuery, TournamentListItem } from '@/domain/types';
import type { BootstrapReport, ChangePreview, FixturePlan, LiveMatch, NewTournamentInput, ServiceError } from '@/services/contracts';
import type {
  AppServices,
  AuditPage,
  GenerateFixturesOptions,
  HistoryEditPreview,
  ImportReport,
  IntegrityReport,
  MatchDetailsPatch,
  MatchRulesPatch,
  PrePlayStatus,
  ShareMimeType,
  TournamentDeleteConfirmation,
  TournamentDeletePreview,
  TournamentInfoPatch,
} from '@/services/contracts';

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

export interface AppStore {
  readonly status: AsyncStatus;
  readonly report: BootstrapReport | null;
  readonly error: ServiceError | null;
  bootstrap(): Promise<boolean>;
  checkIntegrity(): Promise<IntegrityReport | null>;
}

export interface LiveMatchStore {
  readonly matchId: MatchId | null;
  readonly status: AsyncStatus;
  readonly live: LiveMatch | null;
  readonly redoStack: RedoStack;
  readonly error: ServiceError | null;
  readonly warnings: readonly ValidationWarning[];
  readonly editConflict?: EditConflict | null;
  open(matchId: MatchId): Promise<boolean>;
  close(): void;
  dispatch(intent: ScoringIntent): Promise<boolean>;
  undo(reason?: string): Promise<boolean>;
  redo(reason?: string): Promise<boolean>;
  addSquadPlayer(
    teamId: TeamId,
    player: { readonly playerId: PlayerId } | { readonly newPlayer: NewPlayerInput },
    opts?: { readonly isSubstitute?: boolean },
  ): Promise<boolean>;
  clearError(): void;
  clearEditConflict?(): void;
  previewHistoryEdit(ops: readonly HistoryEditOp[]): Promise<HistoryEditPreview | null>;
  applyHistoryEdit(ops: readonly HistoryEditOp[], reason: string | null, preview: HistoryEditPreview): Promise<boolean>;
  updateDetails(patch: MatchDetailsPatch): Promise<boolean>;
  updateRules(patch: MatchRulesPatch, reason: string | null): Promise<boolean>;
  setToss(toss: Toss | null, reason: string | null): Promise<boolean>;
  setPrePlayStatus(status: PrePlayStatus, reason: string | null): Promise<boolean>;
  removeSquadPlayer(playerId: PlayerId): Promise<boolean>;
  loadAudit(page: AuditPage): Promise<readonly AuditEvent[] | null>;
}

export interface HomeStore {
  readonly status: AsyncStatus;
  readonly resumable: readonly MatchListItem[];
  readonly recent: readonly MatchListItem[];
  readonly tournaments: readonly TournamentListItem[];
  load(): Promise<boolean>;
  dismissResume(matchId: MatchId): Promise<boolean>;
  discard(matchId: MatchId): Promise<boolean>;
}

export interface MatchHistoryStore {
  readonly status: AsyncStatus;
  readonly query: MatchListQuery;
  readonly items: readonly MatchListItem[];
  readonly error: ServiceError | null;
  load(query: MatchListQuery): Promise<boolean>;
  loadMore(): Promise<boolean>;
  remove(matchId: MatchId): Promise<boolean>;
}

export interface MatchSetupDraft {
  readonly title: string;
  readonly formatId: FormatId;
  readonly rules: MatchRules;
  readonly venueId: VenueId | null;
  readonly scheduledDate: IsoDate | null;
  readonly scheduledTime: LocalTime | null;
  readonly teamAId: TeamId | null;
  readonly teamBId: TeamId | null;
  readonly teamAPlayers: number | null;
  readonly teamBPlayers: number | null;
  readonly squadA: readonly PlayerId[];
  readonly squadB: readonly PlayerId[];
  readonly substitutesA: readonly PlayerId[];
  readonly substitutesB: readonly PlayerId[];
  readonly toss: Toss | null;
  readonly battingFirstTeamId?: TeamId | null;
  readonly openers: { readonly strikerId: PlayerId | null; readonly nonStrikerId: PlayerId | null; readonly bowlerId: PlayerId | null };
  readonly fixtureId: FixtureId | null;
}

export interface MatchSetupStore {
  readonly draft: MatchSetupDraft;
  readonly status: AsyncStatus;
  readonly error: ServiceError | null;
  update(patch: Partial<MatchSetupDraft>): void;
  startFromFixture(tournamentId: TournamentId, fixtureId: FixtureId): Promise<boolean>;
  reset(): void;
  submit(): Promise<MatchId | null>;
}

export interface TournamentListStore {
  readonly status: AsyncStatus;
  readonly items: readonly TournamentListItem[];
  load(): Promise<boolean>;
}

export interface TournamentStore {
  readonly tournamentId: TournamentId | null;
  readonly status: AsyncStatus;
  readonly snapshot: TournamentSnapshot | null;
  readonly evaluation: TournamentEvaluation | null;
  readonly error: ServiceError | null;
  open(tournamentId: TournamentId): Promise<boolean>;
  refresh(): Promise<boolean>;
  previewChange(change: ProposedChange): Promise<ChangePreview | null>;
  applyChange(change: ProposedChange, reason: string | null, confirmation: ChangePreview): Promise<boolean>;
  clearError(): void;
  whatIf(hypotheticals: readonly HypotheticalResult[]): Promise<WhatIfResult | null>;
  loadStats(): Promise<TournamentStats | null>;
  loadAudit(page: AuditPage): Promise<readonly AuditEvent[] | null>;
  updateFixture(fixtureId: FixtureId, patch: FixturePatch, reason: string | null): Promise<boolean>;
  addFixture(draft: FixtureDraft): Promise<boolean>;
  generateFixtures(stageId: StageId, opts?: GenerateFixturesOptions): Promise<FixturePlan | null>;
  confirmFixtures(stageId: StageId, plan: FixturePlan): Promise<boolean>;
  setStatus(to: TournamentStatus, reason: string | null): Promise<boolean>;
  updateInfo(patch: TournamentInfoPatch): Promise<boolean>;
  listTemplates(): Promise<readonly TournamentTemplate[] | null>;
  saveAsTemplate(meta: { readonly name: string; readonly description: string }): Promise<TournamentTemplate | null>;
  previewDelete(): Promise<TournamentDeletePreview | null>;
  delete(confirm: TournamentDeleteConfirmation): Promise<boolean>;
}

export type TournamentWizardStep = 'info' | 'teams' | 'structure' | 'rules' | 'pools' | 'fixtures' | 'review';

export interface TournamentWizardDraft {
  readonly tournamentId: TournamentId | null;
  readonly info: NewTournamentInput;
  readonly teams: readonly { readonly teamId: TeamId; readonly seed: number | null }[];
  readonly rules: TournamentRules | null;
  readonly stages: readonly Stage[];
  readonly pools: readonly Pool[];
  readonly slots: readonly StageSlot[];
  readonly poolAssignment: PoolAssignment | null;
  readonly fixturePlan: FixturePlan | null;
}

export interface TournamentWizardStore {
  readonly step: TournamentWizardStep;
  readonly draft: TournamentWizardDraft;
  readonly status: AsyncStatus;
  readonly error: ServiceError | null;
  resume(tournamentId: TournamentId): Promise<boolean>;
  update(patch: Partial<TournamentWizardDraft>): void;
  goTo(step: TournamentWizardStep): void;
  saveStep(): Promise<boolean>;
  commit(): Promise<TournamentId | null>;
  reset(): void;
  listTemplates(): Promise<readonly TournamentTemplate[] | null>;
}

export interface SettingsStore {
  readonly loaded: boolean;
  readonly settings: AppSettings;
  load(): Promise<boolean>;
  update(patch: Partial<AppSettings>): Promise<boolean>;
}

export interface Toast {
  readonly id: string;
  readonly kind: 'info' | 'success' | 'warning' | 'error';
  readonly message: string;
  readonly action: { readonly label: string; readonly run: () => void } | null;
}

export interface ToastStore {
  readonly toasts: readonly Toast[];
  show(toast: Omit<Toast, 'id'>): string;
  dismiss(id: string): void;
}

export interface TeamDetail {
  readonly team: Team;
  readonly players: readonly Player[];
}

export interface TeamLibraryStore {
  readonly status: AsyncStatus;
  readonly teams: readonly Team[];
  readonly playerCounts?: Readonly<Record<TeamId, number>>;
  readonly venues: readonly Venue[];
  readonly detail: TeamDetail | null;
  readonly error: ServiceError | null;
  load(opts?: { readonly search?: string; readonly includeArchived?: boolean }): Promise<boolean>;
  loadTeam(teamId: TeamId): Promise<boolean>;
  createTeam(input: NewTeamInput): Promise<Team | null>;
  updateTeam(team: Team): Promise<boolean>;
  archiveTeam(teamId: TeamId): Promise<boolean>;
  addPlayer(teamId: TeamId, input: NewPlayerInput): Promise<Player | null>;
  updatePlayer(player: Player): Promise<boolean>;
  archivePlayer(playerId: PlayerId): Promise<boolean>;
  createVenue(input: { readonly name: string; readonly location: string | null }): Promise<Venue | null>;
  archiveVenue(venueId: VenueId): Promise<boolean>;
  clearError(): void;
}

export interface ExportStore {
  readonly status: AsyncStatus;
  readonly error: ServiceError | null;
  scorecardPdf(matchId: MatchId): Promise<string | null>;
  tournamentPdf(tournamentId: TournamentId): Promise<string | null>;
  share(fileUri: string, mimeType: ShareMimeType): Promise<boolean>;
  clearError(): void;
}

export interface BackupStore {
  readonly status: AsyncStatus;
  readonly error: ServiceError | null;
  readonly exportedFileUri: string | null;
  readonly importFileUri: string | null;
  readonly preview: ImportPreview | null;
  readonly report: ImportReport | null;
  exportBackup(scope: BackupScope): Promise<string | null>;
  previewImport(fileUri: string): Promise<boolean>;
  applyImport(fileUri: string, policy: ImportConflictPolicy): Promise<boolean>;
  reset(): void;
}

export interface AppServicesRegistry {
  setAppServices(services: AppServices): void;
  getAppServices(): AppServices;
}

import type {
  AppStore,
  BackupStore,
  ExportStore,
  HomeStore,
  LiveMatchStore,
  MatchHistoryStore,
  MatchSetupDraft,
  MatchSetupStore,
  SettingsStore,
  TeamLibraryStore,
  ToastStore,
  TournamentListStore,
  TournamentStore,
  TournamentWizardStore,
} from '@/stores/contracts';
import type { AppSettings } from '@/domain/types';
import { BASE_MATCH_RULES } from '@/domain/scoring/presets';

function resolved<T>(value: T): jest.Mock<Promise<T>> {
  return jest.fn(() => Promise.resolve(value));
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  hapticsEnabled: true,
  soundEnabled: false,
  reducedMotion: 'off',
  defaultFormatId: 'T20',
  scoring: { confirmInningsEnd: false, autoPromptBowler: true, dotStyle: 'zero', keepAwake: true },
};

export function emptyDraft(): MatchSetupDraft {
  return {
    title: '',
    formatId: 'T20',
    rules: BASE_MATCH_RULES,
    venueId: null,
    scheduledDate: null,
    scheduledTime: null,
    teamAId: null,
    teamBId: null,
    teamAPlayers: null,
    teamBPlayers: null,
    squadA: [],
    squadB: [],
    substitutesA: [],
    substitutesB: [],
    toss: null,
    openers: { strikerId: null, nonStrikerId: null, bowlerId: null },
    fixtureId: null,
  };
}

export function fakeApp(overrides: Partial<AppStore> = {}): AppStore {
  return {
    status: 'ready',
    report: null,
    error: null,
    bootstrap: resolved(true),
    checkIntegrity: resolved(null),
    ...overrides,
  };
}

export function fakeLive(overrides: Partial<LiveMatchStore> = {}): LiveMatchStore {
  return {
    matchId: null,
    status: 'idle',
    live: null,
    redoStack: [],
    error: null,
    warnings: [],
    open: resolved(true),
    close: jest.fn(),
    dispatch: resolved(true),
    undo: resolved(true),
    redo: resolved(true),
    addSquadPlayer: resolved(true),
    clearError: jest.fn(),
    previewHistoryEdit: resolved(null),
    applyHistoryEdit: resolved(true),
    updateDetails: resolved(true),
    updateRules: resolved(true),
    setToss: resolved(true),
    setPrePlayStatus: resolved(true),
    removeSquadPlayer: resolved(true),
    loadAudit: resolved([]),
    ...overrides,
  };
}

export function fakeHome(overrides: Partial<HomeStore> = {}): HomeStore {
  return {
    status: 'ready',
    resumable: [],
    recent: [],
    tournaments: [],
    load: resolved(true),
    dismissResume: resolved(true),
    discard: resolved(true),
    ...overrides,
  };
}

export function fakeHistory(overrides: Partial<MatchHistoryStore> = {}): MatchHistoryStore {
  return {
    status: 'ready',
    query: { sort: 'recent' },
    items: [],
    error: null,
    load: resolved(true),
    loadMore: resolved(true),
    remove: resolved(true),
    ...overrides,
  };
}

export function fakeSetup(overrides: Partial<MatchSetupStore> = {}): MatchSetupStore {
  return {
    draft: emptyDraft(),
    status: 'idle',
    error: null,
    update: jest.fn(),
    startFromFixture: resolved(true),
    reset: jest.fn(),
    submit: resolved('M1'),
    ...overrides,
  };
}

export function fakeTournamentList(overrides: Partial<TournamentListStore> = {}): TournamentListStore {
  return { status: 'ready', items: [], load: resolved(true), ...overrides };
}

export function fakeTournament(overrides: Partial<TournamentStore> = {}): TournamentStore {
  return {
    tournamentId: null,
    status: 'idle',
    snapshot: null,
    evaluation: null,
    error: null,
    open: resolved(true),
    refresh: resolved(true),
    previewChange: resolved(null),
    applyChange: resolved(true),
    clearError: jest.fn(),
    whatIf: resolved(null),
    loadStats: resolved(null),
    loadAudit: resolved(null),
    updateFixture: resolved(true),
    addFixture: resolved(true),
    generateFixtures: resolved(null),
    confirmFixtures: resolved(true),
    setStatus: resolved(true),
    updateInfo: resolved(true),
    listTemplates: resolved(null),
    saveAsTemplate: resolved(null),
    previewDelete: resolved(null),
    delete: resolved(true),
    ...overrides,
  };
}

export function fakeWizard(overrides: Partial<TournamentWizardStore> = {}): TournamentWizardStore {
  return {
    step: 'info',
    draft: {
      tournamentId: null,
      info: {
        name: '',
        season: null,
        description: null,
        organizer: null,
        startDate: null,
        endDate: null,
        venueIds: [],
        structureKind: 'league',
        templateId: null,
      },
      teams: [],
      rules: null,
      stages: [],
      pools: [],
      slots: [],
      poolAssignment: null,
      fixturePlan: null,
    },
    status: 'idle',
    error: null,
    resume: resolved(true),
    update: jest.fn(),
    goTo: jest.fn(),
    saveStep: resolved(true),
    commit: resolved(null),
    reset: jest.fn(),
    listTemplates: resolved(null),
    ...overrides,
  };
}

export function fakeSettings(overrides: Partial<SettingsStore> = {}): SettingsStore {
  return { loaded: true, settings: DEFAULT_SETTINGS, load: resolved(true), update: resolved(true), ...overrides };
}

export function fakeToast(overrides: Partial<ToastStore> = {}): ToastStore {
  return { toasts: [], show: jest.fn(() => 'toast-1'), dismiss: jest.fn(), ...overrides };
}

export function fakeTeamLibrary(overrides: Partial<TeamLibraryStore> = {}): TeamLibraryStore {
  return {
    status: 'ready',
    teams: [],
    venues: [],
    detail: null,
    error: null,
    load: resolved(true),
    loadTeam: resolved(true),
    createTeam: resolved(null),
    updateTeam: resolved(true),
    archiveTeam: resolved(true),
    addPlayer: resolved(null),
    updatePlayer: resolved(true),
    archivePlayer: resolved(true),
    createVenue: resolved(null),
    archiveVenue: resolved(true),
    clearError: jest.fn(),
    ...overrides,
  };
}

export function fakeExport(overrides: Partial<ExportStore> = {}): ExportStore {
  return {
    status: 'idle',
    error: null,
    scorecardPdf: resolved('file:///scorecard.pdf'),
    tournamentPdf: resolved(null),
    share: resolved(true),
    clearError: jest.fn(),
    ...overrides,
  };
}

export function fakeBackup(overrides: Partial<BackupStore> = {}): BackupStore {
  return {
    status: 'idle',
    error: null,
    exportedFileUri: null,
    importFileUri: null,
    preview: null,
    report: null,
    exportBackup: resolved('file:///backup.json'),
    previewImport: resolved(true),
    applyImport: resolved(true),
    reset: jest.fn(),
    ...overrides,
  };
}

import { BASE_MATCH_RULES } from '@/domain/scoring/presets';
import type {
  BackupStore,
  ExportStore,
  MatchSetupDraft,
  MatchSetupStore,
  TeamLibraryStore,
  ToastStore,
  TournamentListStore,
  TournamentStore,
  TournamentWizardDraft,
  TournamentWizardStore,
} from '@/stores/contracts';

export function fakeTournamentStore(overrides: Partial<TournamentStore> = {}): TournamentStore {
  return {
    tournamentId: null,
    status: 'idle',
    snapshot: null,
    evaluation: null,
    error: null,
    open: jest.fn(async () => true),
    refresh: jest.fn(async () => true),
    previewChange: jest.fn(async () => null),
    applyChange: jest.fn(async () => true),
    clearError: jest.fn(),
    whatIf: jest.fn(async () => null),
    loadStats: jest.fn(async () => null),
    loadAudit: jest.fn(async () => []),
    updateFixture: jest.fn(async () => true),
    addFixture: jest.fn(async () => true),
    generateFixtures: jest.fn(async () => null),
    confirmFixtures: jest.fn(async () => true),
    setStatus: jest.fn(async () => true),
    updateInfo: jest.fn(async () => true),
    listTemplates: jest.fn(async () => []),
    saveAsTemplate: jest.fn(async () => null),
    previewDelete: jest.fn(async () => null),
    delete: jest.fn(async () => true),
    ...overrides,
  };
}

export function fakeTournamentListStore(overrides: Partial<TournamentListStore> = {}): TournamentListStore {
  return {
    status: 'ready',
    items: [],
    load: jest.fn(async () => true),
    ...overrides,
  };
}

export const EMPTY_WIZARD_DRAFT: TournamentWizardDraft = {
  tournamentId: null,
  info: {
    name: '',
    season: null,
    description: null,
    organizer: null,
    startDate: null,
    endDate: null,
    venueIds: [],
    structureKind: 'groups_knockout',
    templateId: null,
  },
  teams: [],
  rules: null,
  stages: [],
  pools: [],
  slots: [],
  poolAssignment: null,
  fixturePlan: null,
};

export function fakeWizardStore(overrides: Partial<TournamentWizardStore> = {}): TournamentWizardStore {
  return {
    step: 'info',
    draft: EMPTY_WIZARD_DRAFT,
    status: 'idle',
    error: null,
    resume: jest.fn(async () => true),
    update: jest.fn(),
    goTo: jest.fn(),
    saveStep: jest.fn(async () => true),
    commit: jest.fn(async () => 't1'),
    reset: jest.fn(),
    listTemplates: jest.fn(async () => []),
    ...overrides,
  };
}

const EMPTY_SETUP_DRAFT: MatchSetupDraft = {
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

export function fakeMatchSetupStore(overrides: Partial<MatchSetupStore> = {}): MatchSetupStore {
  return {
    draft: EMPTY_SETUP_DRAFT,
    status: 'idle',
    error: null,
    update: jest.fn(),
    startFromFixture: jest.fn(async () => true),
    reset: jest.fn(),
    submit: jest.fn(async () => null),
    ...overrides,
  };
}

export function fakeTeamLibraryStore(overrides: Partial<TeamLibraryStore> = {}): TeamLibraryStore {
  return {
    status: 'ready',
    teams: [],
    venues: [],
    detail: null,
    error: null,
    load: jest.fn(async () => true),
    loadTeam: jest.fn(async () => true),
    createTeam: jest.fn(async () => null),
    updateTeam: jest.fn(async () => true),
    archiveTeam: jest.fn(async () => true),
    addPlayer: jest.fn(async () => null),
    updatePlayer: jest.fn(async () => true),
    archivePlayer: jest.fn(async () => true),
    createVenue: jest.fn(async () => null),
    archiveVenue: jest.fn(async () => true),
    clearError: jest.fn(),
    ...overrides,
  };
}

export function fakeToastStore(overrides: Partial<ToastStore> = {}): ToastStore {
  return {
    toasts: [],
    show: jest.fn(() => 'toast-1'),
    dismiss: jest.fn(),
    ...overrides,
  };
}

export function fakeExportStore(overrides: Partial<ExportStore> = {}): ExportStore {
  return {
    status: 'idle',
    error: null,
    scorecardPdf: jest.fn(async () => null),
    tournamentPdf: jest.fn(async () => 'file:///tournament.pdf'),
    share: jest.fn(async () => true),
    clearError: jest.fn(),
    ...overrides,
  };
}

export function fakeBackupStore(overrides: Partial<BackupStore> = {}): BackupStore {
  return {
    status: 'idle',
    error: null,
    exportedFileUri: null,
    importFileUri: null,
    preview: null,
    report: null,
    exportBackup: jest.fn(async () => 'file:///backup.json'),
    previewImport: jest.fn(async () => true),
    applyImport: jest.fn(async () => true),
    reset: jest.fn(),
    ...overrides,
  };
}

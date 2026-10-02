import { create } from 'zustand';
import type {
  AppStore,
  BackupStore,
  ExportStore,
  HomeStore,
  LiveMatchStore,
  MatchHistoryStore,
  MatchSetupStore,
  SettingsStore,
  TeamLibraryStore,
  ToastStore,
  TournamentListStore,
  TournamentStore,
  TournamentWizardStore,
} from '@/stores/contracts';
import {
  fakeApp,
  fakeBackup,
  fakeExport,
  fakeHistory,
  fakeHome,
  fakeLive,
  fakeSettings,
  fakeSetup,
  fakeTeamLibrary,
  fakeToast,
  fakeTournament,
  fakeTournamentList,
  fakeWizard,
} from './fakes';

export function storeModule() {
  return {
    useAppStore: create<AppStore>()(() => fakeApp()),
    useLiveMatchStore: create<LiveMatchStore>()(() => fakeLive()),
    useHomeStore: create<HomeStore>()(() => fakeHome()),
    useMatchHistoryStore: create<MatchHistoryStore>()(() => fakeHistory()),
    useMatchSetupStore: create<MatchSetupStore>()(() => fakeSetup()),
    useTournamentListStore: create<TournamentListStore>()(() => fakeTournamentList()),
    useTournamentStore: create<TournamentStore>()(() => fakeTournament()),
    useTournamentWizardStore: create<TournamentWizardStore>()(() => fakeWizard()),
    useSettingsStore: create<SettingsStore>()(() => fakeSettings()),
    useToastStore: create<ToastStore>()(() => fakeToast()),
    useTeamLibraryStore: create<TeamLibraryStore>()(() => fakeTeamLibrary()),
    useExportStore: create<ExportStore>()(() => fakeExport()),
    useBackupStore: create<BackupStore>()(() => fakeBackup()),
    setAppServices: jest.fn(),
    getAppServices: jest.fn(),
  };
}

export type MockStores = ReturnType<typeof storeModule>;

export function mockStores(): MockStores {
  return jest.requireMock<MockStores>('@/stores');
}

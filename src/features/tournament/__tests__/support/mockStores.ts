import { create } from 'zustand';
import type {
  BackupStore,
  ExportStore,
  MatchSetupStore,
  TeamLibraryStore,
  ToastStore,
  TournamentListStore,
  TournamentStore,
  TournamentWizardStore,
} from '@/stores/contracts';
import {
  fakeBackupStore,
  fakeExportStore,
  fakeMatchSetupStore,
  fakeTeamLibraryStore,
  fakeToastStore,
  fakeTournamentListStore,
  fakeTournamentStore,
  fakeWizardStore,
} from './fakes';

export const useTournamentStore = create<TournamentStore>()(() => fakeTournamentStore());
export const useTournamentListStore = create<TournamentListStore>()(() => fakeTournamentListStore());
export const useTournamentWizardStore = create<TournamentWizardStore>()(() => fakeWizardStore());
export const useMatchSetupStore = create<MatchSetupStore>()(() => fakeMatchSetupStore());
export const useTeamLibraryStore = create<TeamLibraryStore>()(() => fakeTeamLibraryStore());
export const useToastStore = create<ToastStore>()(() => fakeToastStore());
export const useExportStore = create<ExportStore>()(() => fakeExportStore());
export const useBackupStore = create<BackupStore>()(() => fakeBackupStore());
export const setAppServices = jest.fn();
export const getAppServices = jest.fn(() => {
  throw new Error('Screens must not reach the services');
});

export function resetStores(): void {
  useTournamentStore.setState(fakeTournamentStore(), true);
  useTournamentListStore.setState(fakeTournamentListStore(), true);
  useTournamentWizardStore.setState(fakeWizardStore(), true);
  useMatchSetupStore.setState(fakeMatchSetupStore(), true);
  useTeamLibraryStore.setState(fakeTeamLibraryStore(), true);
  useToastStore.setState(fakeToastStore(), true);
  useExportStore.setState(fakeExportStore(), true);
  useBackupStore.setState(fakeBackupStore(), true);
}

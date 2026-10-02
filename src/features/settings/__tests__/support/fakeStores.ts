import { create } from 'zustand';
import type { AppSettings, BackupScope, ImportConflictPolicy } from '@/domain/types';
import type { AppStore, BackupStore, ExportStore, SettingsStore, ToastStore, TournamentListStore } from '@/stores';
import { appSettings, BACKUP_URI, bootstrapReport, importPreview, importReport, integrityReport } from './fixtures';

export const useFakeSettingsStore = create<SettingsStore>()(() => initialSettings());
export const useFakeBackupStore = create<BackupStore>()(() => initialBackup());
export const useFakeExportStore = create<ExportStore>()(() => initialExport());
export const useFakeAppStore = create<AppStore>()(() => initialApp());
export const useFakeToastStore = create<ToastStore>()(() => initialToast());
export const useFakeTournamentListStore = create<TournamentListStore>()(() => initialTournamentList());

function initialSettings(): SettingsStore {
  return {
    loaded: true,
    settings: appSettings(),
    load: jest.fn(async () => {
      useFakeSettingsStore.setState({ loaded: true });
      return true;
    }),
    update: jest.fn(async (patch: Partial<AppSettings>) => {
      useFakeSettingsStore.setState((state) => ({ settings: { ...state.settings, ...patch } }));
      return true;
    }),
  };
}

function initialBackup(): BackupStore {
  return {
    status: 'idle',
    error: null,
    exportedFileUri: null,
    importFileUri: null,
    preview: null,
    report: null,
    exportBackup: jest.fn(async (_scope: BackupScope) => {
      useFakeBackupStore.setState({ exportedFileUri: BACKUP_URI });
      return BACKUP_URI;
    }),
    previewImport: jest.fn(async (fileUri: string) => {
      useFakeBackupStore.setState({ importFileUri: fileUri, preview: importPreview() });
      return true;
    }),
    applyImport: jest.fn(async (_fileUri: string, _policy: ImportConflictPolicy) => {
      useFakeBackupStore.setState({ report: importReport() });
      return true;
    }),
    reset: jest.fn(() => {
      useFakeBackupStore.setState({ exportedFileUri: null, importFileUri: null, preview: null, report: null, error: null });
    }),
  };
}

function initialExport(): ExportStore {
  return {
    status: 'idle',
    error: null,
    scorecardPdf: jest.fn(async () => null),
    tournamentPdf: jest.fn(async () => null),
    share: jest.fn(async () => true),
    clearError: jest.fn(() => {
      useFakeExportStore.setState({ error: null });
    }),
  };
}

function initialApp(): AppStore {
  return {
    status: 'ready',
    report: bootstrapReport(),
    error: null,
    bootstrap: jest.fn(async () => true),
    checkIntegrity: jest.fn(async () => integrityReport()),
  };
}

function initialToast(): ToastStore {
  return {
    toasts: [],
    show: jest.fn(() => 'toast-1'),
    dismiss: jest.fn(),
  };
}

function initialTournamentList(): TournamentListStore {
  return {
    status: 'ready',
    items: [],
    load: jest.fn(async () => true),
  };
}

export function resetFakeStores(): void {
  useFakeSettingsStore.setState(initialSettings(), true);
  useFakeBackupStore.setState(initialBackup(), true);
  useFakeExportStore.setState(initialExport(), true);
  useFakeAppStore.setState(initialApp(), true);
  useFakeToastStore.setState(initialToast(), true);
  useFakeTournamentListStore.setState(initialTournamentList(), true);
}

export const fakeStoresModule = {
  useSettingsStore: useFakeSettingsStore,
  useBackupStore: useFakeBackupStore,
  useExportStore: useFakeExportStore,
  useAppStore: useFakeAppStore,
  useToastStore: useFakeToastStore,
  useTournamentListStore: useFakeTournamentListStore,
};

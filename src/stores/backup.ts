import { create } from 'zustand';
import type { BackupStore } from './contracts';
import { useHomeStore } from './home';
import { call, storeError } from './internal/call';
import { createSingleFlight } from './internal/singleFlight';
import { useMatchHistoryStore } from './matchHistory';
import { useTournamentListStore } from './tournamentList';

type BackupState = Pick<BackupStore, 'status' | 'error' | 'exportedFileUri' | 'importFileUri' | 'preview' | 'report'>;

const INITIAL: BackupState = { status: 'idle', error: null, exportedFileUri: null, importFileUri: null, preview: null, report: null };

async function reloadLists(): Promise<void> {
  const reloads: Promise<boolean>[] = [];
  if (useHomeStore.getState().status !== 'idle') {
    reloads.push(useHomeStore.getState().load());
  }
  if (useMatchHistoryStore.getState().status !== 'idle') {
    reloads.push(useMatchHistoryStore.getState().load(useMatchHistoryStore.getState().query));
  }
  if (useTournamentListStore.getState().status !== 'idle') {
    reloads.push(useTournamentListStore.getState().load());
  }
  await Promise.all(reloads);
}

const importing = createSingleFlight();

export const useBackupStore = create<BackupStore>()((set, get) => ({
  ...INITIAL,

  async exportBackup(scope) {
    set({ status: 'saving', error: null, exportedFileUri: null });
    const result = await call((services) => services.backup.exportBackup(scope));
    if (!result.ok) {
      set({ status: 'ready', error: result.error });
      return null;
    }
    set({ status: 'ready', exportedFileUri: result.value.fileUri });
    return result.value.fileUri;
  },

  async previewImport(fileUri) {
    set({ status: 'loading', error: null, importFileUri: fileUri, preview: null, report: null });
    const result = await call((services) => services.backup.previewImport(fileUri));
    if (get().importFileUri !== fileUri) {
      return false;
    }
    if (!result.ok) {
      set({ status: 'ready', error: result.error });
      return false;
    }
    set({ status: 'ready', preview: result.value });
    return true;
  },

  applyImport(fileUri, policy) {
    return importing.run(async () => {
      const { importFileUri, preview } = get();
      if (fileUri !== importFileUri || preview === null || !preview.ok) {
        set({ error: storeError('IMPORT_INVALID', 'Preview a valid backup before importing it.') });
        return false;
      }
      set({ status: 'saving', error: null });
      const result = await call((services) => services.backup.applyImport(fileUri, policy));
      if (!result.ok) {
        set({ status: 'ready', error: result.error });
        return false;
      }
      set({ status: 'ready', report: result.value });
      await reloadLists();
      return true;
    }, false);
  },

  reset() {
    set(INITIAL);
  },
}));

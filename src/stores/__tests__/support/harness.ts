import type { StoreApi, UseBoundStore } from 'zustand';
import { createSqlJsDatabase, type SqlJsTestDatabase } from '@/db/testing';
import type { FeedbackCue, ScoringFeedback } from '@/services';
import type { ServiceResult } from '@/services/contracts';
import { createTestApp, type TestApp, type TestDeps } from '@/services/testing';
import {
  useAppStore,
  useBackupStore,
  useExportStore,
  useHomeStore,
  useLiveMatchStore,
  useMatchHistoryStore,
  useMatchSetupStore,
  useSettingsStore,
  useTeamLibraryStore,
  useToastStore,
  useTournamentListStore,
  useTournamentStore,
  useTournamentWizardStore,
} from '@/stores';
import { clearAppServices, setAppServices, setScoringFeedback } from '@/stores/services';

export interface StoreHarness {
  readonly db: SqlJsTestDatabase;
  readonly app: TestApp;
  readonly cues: FeedbackCue[];
}

function reset<T>(store: UseBoundStore<StoreApi<T>>): void {
  store.setState(store.getInitialState(), true);
}

export function resetStores(): void {
  useLiveMatchStore.getState().close();
  reset(useAppStore);
  reset(useBackupStore);
  reset(useExportStore);
  reset(useHomeStore);
  reset(useLiveMatchStore);
  reset(useMatchHistoryStore);
  reset(useMatchSetupStore);
  reset(useSettingsStore);
  reset(useTeamLibraryStore);
  reset(useToastStore);
  reset(useTournamentListStore);
  reset(useTournamentStore);
  reset(useTournamentWizardStore);
}

export function expectValue<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message} ${result.error.detail ?? ''}`);
  }
  return result.value;
}

export async function storeHarness(overrides: Partial<TestDeps> = {}, db?: SqlJsTestDatabase): Promise<StoreHarness> {
  resetStores();
  clearAppServices();
  const database = db ?? (await createSqlJsDatabase());
  const app = createTestApp(database, overrides);
  setAppServices(app);
  const cues: FeedbackCue[] = [];
  const feedback: ScoringFeedback = { cue: (cue) => cues.push(cue) };
  setScoringFeedback(feedback);
  expectValue(await app.bootstrap());
  return { db: database, app, cues };
}

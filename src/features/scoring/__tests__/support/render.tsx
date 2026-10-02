import type { ReactElement } from 'react';
import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import type { Metrics } from 'react-native-safe-area-context';
import { renderWithTheme, TEST_METRICS } from '@/ui/testing';
import type { LiveMatch } from '@/services/contracts';
import type { LiveMatchStore } from '@/stores/contracts';
import { DEFAULT_SETTINGS, fakeLive, fakeSettings, fakeToast } from './fakes';
import { mockStores } from './storeModule';

const { useLiveMatchStore, useSettingsStore, useToastStore } = mockStores();

export function renderScreen(ui: ReactElement, metrics: Metrics = TEST_METRICS) {
  return renderWithTheme(ui, { metrics });
}

export function setLive(live: LiveMatch | null, overrides: Partial<LiveMatchStore> = {}): LiveMatchStore {
  const store = fakeLive({ matchId: live?.match.id ?? null, status: live === null ? 'loading' : 'ready', live, ...overrides });
  useLiveMatchStore.setState(store, true);
  return store;
}

export function resetCommonStores(scoring: Partial<typeof DEFAULT_SETTINGS.scoring> = {}): void {
  useSettingsStore.setState(fakeSettings({ settings: { ...DEFAULT_SETTINGS, scoring: { ...DEFAULT_SETTINGS.scoring, ...scoring } } }), true);
  useToastStore.setState(fakeToast(), true);
}

export function setWindow(width: number, height: number): () => Promise<void> {
  const previous = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
  const next = { width, height, scale: 2, fontScale: 1 };
  Dimensions.set({ window: next, screen: next });
  return async () => {
    await act(async () => {
      Dimensions.set(previous);
    });
  };
}

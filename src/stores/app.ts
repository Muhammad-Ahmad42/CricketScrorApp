import { create } from 'zustand';
import { createDeviceFeedback, createDeviceServices } from '@/services/platform/device';
import type { AppStore } from './contracts';
import { call, unexpected } from './internal/call';
import { hasAppServices, setAppServices, setScoringFeedback } from './services';
import { useSettingsStore } from './settings';

const BOOTSTRAP_MESSAGE = "Couldn't open your scorebook data. Nothing has been changed.";

function ensureServices(): void {
  if (!hasAppServices()) {
    setAppServices(createDeviceServices());
    setScoringFeedback(createDeviceFeedback(() => useSettingsStore.getState().settings));
  }
}

export const useAppStore = create<AppStore>()((set, get) => {
  let inflight: Promise<boolean> | null = null;

  const run = async (): Promise<boolean> => {
    set({ status: 'loading', error: null });
    try {
      ensureServices();
    } catch (error) {
      set({ status: 'error', error: unexpected(error, BOOTSTRAP_MESSAGE) });
      return false;
    }
    const result = await call((services) => services.bootstrap());
    if (!result.ok) {
      set({ status: 'error', error: result.error });
      return false;
    }
    await useSettingsStore.getState().load();
    set({ status: 'ready', report: result.value, error: null });
    return true;
  };

  return {
    status: 'idle',
    report: null,
    error: null,

    bootstrap() {
      if (inflight !== null) {
        return inflight;
      }
      if (get().status === 'ready') {
        return Promise.resolve(true);
      }
      inflight = run().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    async checkIntegrity() {
      const result = await call((services) => services.checkIntegrity());
      if (!result.ok) {
        set({ error: result.error });
        return null;
      }
      return result.value;
    },
  };
});

export function forgetResumable(matchId: string): void {
  useAppStore.setState((state) => ({
    report: state.report === null ? null : { ...state.report, resumable: state.report.resumable.filter((item) => item.id !== matchId) },
  }));
}

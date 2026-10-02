import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/services';
import type { SettingsStore } from './contracts';
import { call } from './internal/call';
import { showErrorToast } from './toast';

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  async load() {
    const result = await call((services) => services.settings.load());
    if (!result.ok) {
      return false;
    }
    set({ settings: result.value, loaded: true });
    return true;
  },
  async update(patch) {
    const previous = get().settings;
    set({
      settings: {
        ...previous,
        ...patch,
        scoring: patch.scoring === undefined ? previous.scoring : { ...previous.scoring, ...patch.scoring },
      },
    });
    const result = await call((services) => services.settings.update(patch));
    if (!result.ok) {
      set({ settings: previous });
      showErrorToast(result.error.message);
      return false;
    }
    set({ settings: result.value, loaded: true });
    return true;
  },
}));

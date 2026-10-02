import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ScoringPreferences } from '@/domain/types';
import { useSettingsStore, useToastStore } from '@/stores';
import { COPY } from '../copy';
import { scoringPatch, settledScoring } from '../selectors/settings';

export interface SettingsWriter {
  readonly settings: AppSettings;
  save(patch: Partial<AppSettings>): Promise<boolean>;
  saveScoring(change: Partial<ScoringPreferences>): Promise<boolean>;
}

export interface SettingsLoad {
  readonly loaded: boolean;
  readonly failed: boolean;
  retry(): void;
}

export function useEnsureSettingsLoaded(): SettingsLoad {
  const loaded = useSettingsStore((state) => state.loaded);
  const load = useSettingsStore((state) => state.load);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setFailed(false);
    const ok = await load();
    if (!ok && !useSettingsStore.getState().loaded) {
      setFailed(true);
    }
  }, [load]);

  useEffect(() => {
    if (!loaded) {
      void attempt();
    }
  }, [loaded, attempt]);

  return { loaded, failed: failed && !loaded, retry: () => void attempt() };
}

export function useSettingsWriter(): SettingsWriter {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const showToast = useToastStore((state) => state.show);
  const pendingScoring = useRef<Partial<ScoringPreferences>>({});

  const persist = async (patch: Partial<AppSettings>, retry: () => void): Promise<boolean> => {
    const ok = await update(patch);
    if (!ok) {
      showToast({ kind: 'error', message: COPY.settingSaveFailed, action: { label: COPY.tryAgain, run: retry } });
    }
    return ok;
  };

  const save = (patch: Partial<AppSettings>): Promise<boolean> => persist(patch, () => void save(patch));

  const saveScoring = async (change: Partial<ScoringPreferences>): Promise<boolean> => {
    const current = useSettingsStore.getState();
    if (!current.loaded) {
      return false;
    }
    const pending = { ...pendingScoring.current, ...change };
    pendingScoring.current = pending;
    try {
      return await persist(scoringPatch(current.settings.scoring, pending), () => void saveScoring(change));
    } finally {
      pendingScoring.current = settledScoring(pendingScoring.current, change);
    }
  };

  return { settings, save, saveScoring };
}

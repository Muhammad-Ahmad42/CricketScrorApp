import { DEFAULT_FORMAT_ID } from '@/domain/scoring';
import type { AppSettings, ScoringPreferences } from '@/domain/types';

export const DEFAULT_SCORING_PREFERENCES: ScoringPreferences = {
  confirmInningsEnd: true,
  autoPromptBowler: true,
  dotStyle: 'zero',
  keepAwake: true,
  padHand: 'right',
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  hapticsEnabled: true,
  soundEnabled: false,
  reducedMotion: 'system',
  reduceTransparency: false,
  defaultFormatId: DEFAULT_FORMAT_ID,
  scoring: DEFAULT_SCORING_PREFERENCES,
};

export function mergeSettings(stored: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    scoring: { ...DEFAULT_SCORING_PREFERENCES, ...(stored.scoring ?? {}) },
  };
}

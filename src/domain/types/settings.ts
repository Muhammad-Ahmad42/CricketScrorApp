import type { FormatId } from './rules';

export type ThemePreference = 'light' | 'dark' | 'system';

export type PadHand = 'right' | 'left';

export interface ScoringPreferences {
  readonly confirmInningsEnd: boolean;
  readonly autoPromptBowler: boolean;
  readonly dotStyle: 'zero' | 'dot';
  readonly keepAwake: boolean;
  readonly padHand?: PadHand;
}

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly hapticsEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly reducedMotion: 'system' | 'on' | 'off';
  readonly reduceTransparency?: boolean;
  readonly defaultFormatId: FormatId;
  readonly scoring: ScoringPreferences;
}

export type AppSettingsKey = keyof AppSettings;

import type { AppSettings, FormatId, FormatPreset, PadHand, ScoringPreferences, ThemePreference } from '@/domain/types';

export type ReducedMotionSetting = AppSettings['reducedMotion'];
export type DotStyle = ScoringPreferences['dotStyle'];

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly testID: string;
}

export const THEME_CHOICES: readonly Choice<ThemePreference>[] = [
  { value: 'light', label: 'Light', accessibilityLabel: 'Light theme', testID: 'settings-chip-theme-light' },
  { value: 'dark', label: 'Dark', accessibilityLabel: 'Dark theme', testID: 'settings-chip-theme-dark' },
  { value: 'system', label: 'System', accessibilityLabel: 'Follow the system theme', testID: 'settings-chip-theme-system' },
];

export const MOTION_CHOICES: readonly Choice<ReducedMotionSetting>[] = [
  { value: 'system', label: 'System', accessibilityLabel: 'Reduce motion: follow the system setting', testID: 'settings-chip-motion-system' },
  { value: 'on', label: 'On', accessibilityLabel: 'Reduce motion: on', testID: 'settings-chip-motion-on' },
  { value: 'off', label: 'Off', accessibilityLabel: 'Reduce motion: off', testID: 'settings-chip-motion-off' },
];

export const DOT_CHOICES: readonly Choice<DotStyle>[] = [
  { value: 'zero', label: '0', accessibilityLabel: 'Show dot balls as zero', testID: 'settings-chip-dot-zero' },
  { value: 'dot', label: '•', accessibilityLabel: 'Show dot balls as a dot', testID: 'settings-chip-dot-dot' },
];

export const PAD_CHOICES: readonly Choice<PadHand>[] = [
  { value: 'right', label: 'Right hand', accessibilityLabel: 'Scoring pad for the right hand', testID: 'settings-chip-pad-right' },
  { value: 'left', label: 'Left hand', accessibilityLabel: 'Scoring pad for the left hand', testID: 'settings-chip-pad-left' },
];

export const DEFAULT_PAD_HAND: PadHand = 'right';

export interface SettingsVM {
  readonly theme: ThemePreference;
  readonly reducedMotion: ReducedMotionSetting;
  readonly reduceTransparency: boolean;
  readonly hapticsEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly dotStyle: DotStyle;
  readonly padHand: PadHand;
  readonly autoPromptBowler: boolean;
  readonly confirmInningsEnd: boolean;
  readonly keepAwake: boolean;
  readonly defaultFormatLabel: string;
}

export function formatLabel(formatId: FormatId, presets: readonly FormatPreset[]): string {
  const preset = presets.find((candidate) => candidate.id === formatId);
  if (preset) {
    return preset.label;
  }
  return formatId === 'custom' ? 'Custom' : 'Your preset';
}

export function selectSettingsVM(settings: AppSettings, presets: readonly FormatPreset[]): SettingsVM {
  return {
    theme: settings.theme,
    reducedMotion: settings.reducedMotion,
    reduceTransparency: settings.reduceTransparency === true,
    hapticsEnabled: settings.hapticsEnabled,
    soundEnabled: settings.soundEnabled,
    dotStyle: settings.scoring.dotStyle,
    padHand: settings.scoring.padHand ?? DEFAULT_PAD_HAND,
    autoPromptBowler: settings.scoring.autoPromptBowler,
    confirmInningsEnd: settings.scoring.confirmInningsEnd,
    keepAwake: settings.scoring.keepAwake,
    defaultFormatLabel: formatLabel(settings.defaultFormatId, presets),
  };
}

export function scoringPatch(current: ScoringPreferences, change: Partial<ScoringPreferences>): Pick<AppSettings, 'scoring'> {
  return { scoring: { ...current, ...change } };
}

export function settledScoring(pending: Partial<ScoringPreferences>, written: Partial<ScoringPreferences>): Partial<ScoringPreferences> {
  const left: Record<string, unknown> = {};
  for (const key of Object.keys(pending) as (keyof ScoringPreferences)[]) {
    if (!(key in written) || written[key] !== pending[key]) {
      left[key] = pending[key];
    }
  }
  return left as Partial<ScoringPreferences>;
}

import { router } from 'expo-router';
import { getBuiltinPreset } from '@/domain/scoring/presets';
import { useMatchSetupStore, useSettingsStore } from '@/stores';
import { localDateOf, roundedTime } from '@/features/scoring/selectors/dates';

export const TIME_STEP_MINUTES = 15;

export type NowSource = () => Date;

let nowSource: NowSource = () => new Date();

export function setNowSource(next: NowSource | null): void {
  nowSource = next ?? (() => new Date());
}

export function startNewMatch(): void {
  const setup = useMatchSetupStore.getState();
  setup.reset();
  const now = nowSource();
  const preset = getBuiltinPreset(useSettingsStore.getState().settings.defaultFormatId);
  const when = { scheduledDate: localDateOf(now), scheduledTime: roundedTime(now, TIME_STEP_MINUTES) };
  useMatchSetupStore.getState().update(preset !== null ? { formatId: preset.id, rules: preset.rules, ...when } : when);
  router.push('/match/new');
}

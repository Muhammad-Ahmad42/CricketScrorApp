import { router } from 'expo-router';
import { getBuiltinPreset } from '@/domain/scoring/presets';
import { useMatchSetupStore, useSettingsStore } from '@/stores';

export function startNewMatch(): void {
  const setup = useMatchSetupStore.getState();
  setup.reset();
  const preset = getBuiltinPreset(useSettingsStore.getState().settings.defaultFormatId);
  if (preset !== null) {
    useMatchSetupStore.getState().update({ formatId: preset.id, rules: preset.rules });
  }
  router.push('/match/new');
}

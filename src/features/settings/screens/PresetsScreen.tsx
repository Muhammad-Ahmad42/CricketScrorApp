import { useState } from 'react';
import { useRouter } from 'expo-router';
import type { FormatId } from '@/domain/types';
import { NavHeader } from '@/features/shared';
import { Screen, SectionHeader } from '@/ui';
import { PresetList } from '../components/PresetList';
import { FORMAT_PRESETS } from '../constants';
import { useEnsureSettingsLoaded, useSettingsWriter } from '../hooks/useSettingsWriter';
import { presetDetail, presetRows } from '../selectors/presets';
import { PresetDetailSheet } from '../sheets/PresetDetailSheet';

export function PresetsScreen() {
  useEnsureSettingsLoaded();
  const router = useRouter();
  const { settings, save } = useSettingsWriter();
  const [selectedId, setSelectedId] = useState<FormatId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = FORMAT_PRESETS.find((preset) => preset.id === selectedId) ?? null;
  const detail = selected ? presetDetail(selected, settings.defaultFormatId) : null;

  const openPreset = (formatId: FormatId) => {
    setSelectedId(formatId);
    setSheetOpen(true);
  };

  const makeDefault = async () => {
    if (!selected || saving) {
      return;
    }
    setSaving(true);
    await save({ defaultFormatId: selected.id });
    setSaving(false);
  };

  return (
    <Screen testID="screen-presets" header={<NavHeader title="Format presets" onBack={() => router.back()} />}>
      <SectionHeader title="Built-in" />
      <PresetList presets={presetRows(FORMAT_PRESETS, settings.defaultFormatId)} onOpen={openPreset} />
      <PresetDetailSheet visible={sheetOpen} preset={detail} busy={saving} onMakeDefault={() => void makeDefault()} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}

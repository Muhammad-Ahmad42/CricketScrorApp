import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FormatId } from '@/domain/types';
import { Screen, SectionHeader, Text, space, useTheme } from '@/ui';
import { PresetList } from '../components/PresetList';
import { StackHeader, StackIntro } from '../components/StackHeader';
import { FORMAT_PRESETS } from '../constants';
import { COPY } from '../copy';
import { useEnsureSettingsLoaded, useSettingsWriter } from '../hooks/useSettingsWriter';
import { presetDetail, presetRows } from '../selectors/presets';
import { PresetDetailSheet } from '../sheets/PresetDetailSheet';

export function PresetsScreen() {
  useEnsureSettingsLoaded();
  const router = useRouter();
  const theme = useTheme();
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
    <Screen testID="screen-presets" ambient header={<StackHeader title="Format presets" onBack={() => router.back()} />}>
      <StackIntro text={COPY.presetsIntro} testID="presets-text-intro" />
      <SectionHeader title="Built-in" />
      <PresetList presets={presetRows(FORMAT_PRESETS, settings.defaultFormatId)} onOpen={openPreset} />
      <SectionHeader title="Yours" />
      <View style={[styles.block, { backgroundColor: theme.color.surface }]}>
        <Text variant="body" tone="secondary" testID="presets-text-user-unavailable">
          {COPY.userPresetsUnavailable}
        </Text>
      </View>
      <Text variant="footnote" tone="secondary" style={styles.note} testID="presets-text-note">
        {COPY.presetsNote}
      </Text>
      <PresetDetailSheet visible={sheetOpen} preset={detail} busy={saving} onMakeDefault={() => void makeDefault()} onClose={() => setSheetOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: space.md, paddingVertical: space.sm },
  note: { paddingHorizontal: space.md, paddingTop: space.md },
});

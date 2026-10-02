import { StyleSheet, View } from 'react-native';
import { Badge, Button, Sheet, Text, space } from '@/ui';
import { InfoRow } from '../components/InfoRow';
import { COPY } from '../copy';
import type { PresetDetailVM } from '../selectors/presets';

export interface PresetDetailSheetProps {
  readonly visible: boolean;
  readonly preset: PresetDetailVM | null;
  readonly busy: boolean;
  readonly onMakeDefault: () => void;
  readonly onClose: () => void;
}

export function PresetDetailSheet({ visible, preset, busy, onMakeDefault, onClose }: PresetDetailSheetProps) {
  const footer = preset ? (
    preset.isDefault ? (
      <View style={styles.footer}>
        <Badge label="Default for new matches" tone="qualified" testID="presets-badge-default" />
      </View>
    ) : (
      <Button label="Use for new matches" onPress={onMakeDefault} loading={busy} fullWidth testID="presets-btn-make-default" />
    )
  ) : null;
  return (
    <Sheet
      visible={visible && preset !== null}
      title={preset ? preset.title : ''}
      subtitle={preset ? `${preset.description}${preset.builtin ? ' · Built-in, read-only' : ''}` : undefined}
      onClose={onClose}
      footer={footer}
      testID="sheet-preset"
    >
      {preset ? (
        <View>
          {preset.rules.map((line, index) => (
            <InfoRow key={line.key} label={line.label} value={line.value} separator={index < preset.rules.length - 1} />
          ))}
          <Text variant="footnote" tone="secondary" style={styles.note}>
            {COPY.presetsNote}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'flex-start', paddingVertical: space.xs },
  note: { paddingHorizontal: space.md, paddingTop: space.sm },
});

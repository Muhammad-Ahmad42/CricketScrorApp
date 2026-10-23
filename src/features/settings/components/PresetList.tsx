import { StyleSheet, View } from 'react-native';
import type { FormatId } from '@/domain/types';
import { Badge, Icon, ListRow, space } from '@/ui';
import type { PresetRowVM } from '../selectors/presets';

export interface PresetListProps {
  readonly presets: readonly PresetRowVM[];
  readonly onOpen: (formatId: FormatId) => void;
}

const DEFAULT_PRESET_BADGE = 'Default';

function DefaultTrailing() {
  return (
    <View style={styles.trailing}>
      <Badge label={DEFAULT_PRESET_BADGE} tone="outline" />
      <Icon name="chevron-right" size={20} color="textMuted" />
    </View>
  );
}

export function PresetList({ presets, onOpen }: PresetListProps) {
  return (
    <>
      {presets.map((preset, index) => (
        <ListRow
          key={preset.id}
          title={preset.title}
          subtitle={preset.summary}
          trailing={preset.isDefault ? { kind: 'custom', node: <DefaultTrailing /> } : { kind: 'chevron' }}
          accessibilityLabel={[preset.title, preset.summary, ...(preset.isDefault ? [DEFAULT_PRESET_BADGE] : [])].join(', ')}
          onPress={() => onOpen(preset.id)}
          separator={index < presets.length - 1}
          testID={`presets-row-${preset.slug}`}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});

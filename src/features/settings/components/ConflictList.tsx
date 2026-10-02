import { StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';
import type { ConflictVM } from '../selectors/importPreview';

export interface ConflictListProps {
  readonly conflicts: readonly ConflictVM[];
}

export function ConflictList({ conflicts }: ConflictListProps) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.color.surface }}>
      {conflicts.map((conflict, index) => (
        <View key={conflict.key}>
          <View style={styles.row} accessible accessibilityLabel={`${conflict.title}, ${conflict.detail}`} testID={`import-row-conflict-${index + 1}`}>
            <Icon name={conflict.losesLocalData ? 'triangle-alert' : 'info'} size={20} color={conflict.losesLocalData ? 'warning' : 'textSecondary'} />
            <View style={styles.text}>
              <Text variant="body">{conflict.title}</Text>
              <Text variant="footnote" tone="secondary">
                {conflict.detail}
              </Text>
            </View>
          </View>
          <Separator inset={space.md} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 56 },
  text: { flex: 1, gap: space.xxs },
});

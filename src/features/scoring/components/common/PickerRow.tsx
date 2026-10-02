import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, space, useTheme } from '@/ui';

export interface PickerRowProps {
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
  readonly placeholder?: boolean;
  readonly testID?: string;
}

export function PickerRow({ label, value, onPress, placeholder = false, testID }: PickerRowProps) {
  const theme = useTheme();
  const interactive = onPress !== undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={`${label}, ${value}`}
      accessibilityHint={interactive ? 'Opens a list to choose from' : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: theme.size.rowCompact,
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.color.border,
          backgroundColor: pressed ? theme.color.surfaceSunken : 'transparent',
        },
      ]}
    >
      <Text variant="subhead" tone="secondary" style={styles.label}>
        {label}
      </Text>
      <View style={styles.value}>
        <Text variant="bodyStrong" tone={placeholder ? 'muted' : 'primary'} numberOfLines={1} style={styles.valueText}>
          {value}
        </Text>
        {interactive ? <Icon name="chevron-down" size={20} color="textMuted" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 44 },
  label: { width: 112 },
  value: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  valueText: { flexShrink: 1 },
});

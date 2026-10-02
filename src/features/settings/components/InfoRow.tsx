import { StyleSheet, View } from 'react-native';
import { Separator, Text, space, useTheme } from '@/ui';

export interface InfoRowProps {
  readonly label: string;
  readonly value: string;
  readonly valueTestID?: string;
  readonly separator?: boolean;
}

export function InfoRow({ label, value, valueTestID, separator = true }: InfoRowProps) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.color.surface }}>
      <View style={[styles.row, { minHeight: theme.size.rowCompact }]} accessible accessibilityLabel={`${label}, ${value}`}>
        <Text variant="body" tone="secondary" style={styles.label}>
          {label}
        </Text>
        <Text variant="body" weight="medium" style={styles.value} testID={valueTestID}>
          {value}
        </Text>
      </View>
      {separator ? <Separator inset={space.md} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.sm },
  label: { flex: 1 },
  value: { flexShrink: 1, maxWidth: '60%', textAlign: 'right' },
});

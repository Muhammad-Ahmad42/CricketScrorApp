import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text, space, useTheme } from '@/ui';

export interface BusyLineProps {
  readonly text: string;
  readonly testID?: string;
}

export function BusyLine({ text, testID }: BusyLineProps) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.color.surface }]} accessibilityRole="progressbar" accessibilityLabel={text} accessibilityState={{ busy: true }}>
      <ActivityIndicator size="small" color={theme.color.accent} />
      <Text variant="subhead" tone="secondary" testID={testID}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
});

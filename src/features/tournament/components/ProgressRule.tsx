import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/ui';

export interface ProgressRuleProps {
  readonly ratio: number;
  readonly width?: DimensionValue;
  readonly testID?: string;
}

export function ProgressRule({ ratio, width = '50%', testID }: ProgressRuleProps) {
  const theme = useTheme();
  const filled = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` as DimensionValue;
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.track, { width, backgroundColor: theme.color.border, borderRadius: theme.radius.xs }]}
    >
      <View style={[styles.fill, { width: filled, backgroundColor: theme.color.accent, borderRadius: theme.radius.xs }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, overflow: 'hidden' },
  fill: { height: 4 },
});

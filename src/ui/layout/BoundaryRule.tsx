import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { boundaryRule } from '../theme/tokens';

export interface BoundaryRuleProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function BoundaryRule({ style, testID }: BoundaryRuleProps) {
  const { color } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.root, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={{ height: boundaryRule.heavy, backgroundColor: color.textPrimary }} />
      <View style={{ height: boundaryRule.gap }} />
      <View style={{ height: boundaryRule.light, backgroundColor: color.border }} />
    </View>
  );
}

export interface SeparatorProps {
  readonly inset?: number;
  readonly style?: StyleProp<ViewStyle>;
}

export function Separator({ inset = 0, style }: SeparatorProps) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={[{ height: theme.borderWidth.hairline, backgroundColor: theme.color.border, marginLeft: inset }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
});

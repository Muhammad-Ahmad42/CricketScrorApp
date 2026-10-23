import { PixelRatio, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { boundaryRule } from '../theme/tokens';

export type BoundaryRuleTone = 'section' | 'band';

export interface BoundaryRuleProps {
  readonly tone?: BoundaryRuleTone;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function snapHairline(width: number, ratio: number = PixelRatio.get()): number {
  const device = Math.max(1, Math.round(width * ratio));
  return device / ratio;
}

export function BoundaryRule({ tone = 'section', style, testID }: BoundaryRuleProps) {
  const theme = useTheme();
  const { color } = theme;
  return (
    <View
      testID={testID}
      style={[styles.root, style]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {tone === 'band' ? (
        <>
          <View style={{ height: boundaryRule.heavy, backgroundColor: color.accentDeep }} />
          <View style={{ height: boundaryRule.gap }} />
          <View style={{ height: boundaryRule.light, backgroundColor: color.border }} />
        </>
      ) : (
        <View style={{ height: snapHairline(theme.borderWidth.hairline), backgroundColor: color.border }} />
      )}
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
      style={[{ height: snapHairline(theme.borderWidth.hairline), backgroundColor: theme.color.border, marginLeft: inset, flexShrink: 0 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
});

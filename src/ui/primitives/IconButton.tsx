import { Pressable, StyleSheet, View } from 'react-native';
import { space, useTheme, type ColorToken } from '../theme';
import { Text } from '../typography';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, useFocusRing } from './internal/interaction';

export type IconButtonTone = 'default' | 'accent' | 'danger' | 'inverse';

export interface IconButtonProps {
  readonly icon: IconName;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly label?: string;
  readonly tone?: IconButtonTone;
  readonly disabled?: boolean;
  readonly selected?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

const TONES: { readonly [K in IconButtonTone]: ColorToken } = {
  default: 'textPrimary',
  accent: 'accent',
  danger: 'danger',
  inverse: 'inverseText',
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  label,
  tone = 'default',
  disabled = false,
  selected,
  accessibilityHint,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const colorToken: ColorToken = disabled ? 'textMuted' : TONES[tone];
  const withLabel = label !== undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      aria-disabled={disabled}
      aria-selected={selected}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.base,
        withLabel ? styles.withLabel : null,
        { borderRadius: theme.radius.md },
        pressed && !disabled && tone !== 'inverse' ? { backgroundColor: theme.color.surfaceSunken } : null,
        focusRingStyle(theme, focus.focused),
      ]}
    >
      <Icon name={icon} size={withLabel ? 20 : 24} color={colorToken} />
      {withLabel ? (
        <View>
          <Text variant="subhead" style={{ color: theme.color[colorToken] }} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    minHeight: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withLabel: {
    height: 48,
    minHeight: 48,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
});

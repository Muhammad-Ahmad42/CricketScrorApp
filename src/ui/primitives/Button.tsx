import type { Ref } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { space, useTheme, type ColorToken, type Theme } from '../theme';
import { Text } from '../typography';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, hitSlopFor, useFocusRing } from './internal/interaction';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'destructiveConfirm' | 'tertiaryInverse';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly caps?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly ref?: Ref<View>;
}

interface VariantLook {
  readonly background: ColorToken | null;
  readonly pressed: ColorToken | null;
  readonly label: ColorToken;
  readonly border: ColorToken | null;
  readonly pressedOpacity: number;
}

const LOOKS: { readonly [K in ButtonVariant]: VariantLook } = {
  primary: { background: 'accent', pressed: 'accentPressed', label: 'onAccent', border: null, pressedOpacity: 1 },
  secondary: { background: 'surface', pressed: 'surfaceSunken', label: 'textPrimary', border: 'borderStrong', pressedOpacity: 1 },
  tertiary: { background: null, pressed: 'surfaceSunken', label: 'accent', border: null, pressedOpacity: 1 },
  destructive: { background: 'surface', pressed: 'dangerSubtle', label: 'danger', border: 'danger', pressedOpacity: 1 },
  destructiveConfirm: { background: 'danger', pressed: 'danger', label: 'onDanger', border: null, pressedOpacity: 0.88 },
  tertiaryInverse: { background: null, pressed: null, label: 'inverseAccent', border: null, pressedOpacity: 1 },
};

const SIZES = {
  lg: { height: 56, paddingX: space.xl, icon: 20 },
  md: { height: 48, paddingX: space.lg, icon: 20 },
  sm: { height: 36, paddingX: space.sm, icon: 16 },
} as const;

export function buttonSurfaceStyle(theme: Theme, variant: ButtonVariant, pressed: boolean, disabled: boolean): ViewStyle {
  const look = LOOKS[variant];
  if (disabled) {
    return { backgroundColor: theme.color.surfaceSunken, borderWidth: 0 };
  }
  const token = pressed ? look.pressed ?? look.background : look.background;
  return {
    backgroundColor: token ? theme.color[token] : 'transparent',
    borderWidth: look.border ? theme.borderWidth.control : 0,
    borderColor: look.border ? theme.color[look.border] : undefined,
    opacity: pressed ? look.pressedOpacity : 1,
  };
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  caps = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  ref,
}: ButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const look = LOOKS[variant];
  const dims = SIZES[size];
  const labelToken: ColorToken = disabled ? 'textMuted' : look.label;
  const inactive = disabled || loading;
  return (
    <Pressable
      ref={ref}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      hitSlop={hitSlopFor(dims.height)}
      onPress={inactive ? undefined : onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.base,
        {
          height: dims.height,
          minHeight: dims.height,
          paddingHorizontal: dims.paddingX,
          borderRadius: theme.radius.md,
        },
        fullWidth ? styles.fullWidth : null,
        buttonSurfaceStyle(theme, variant, pressed && !inactive, disabled),
        focusRingStyle(theme, focus.focused),
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.color[labelToken]} style={{ width: dims.icon, height: dims.icon }} />
      ) : icon ? (
        <Icon name={icon} size={dims.icon} color={labelToken} />
      ) : null}
      <View style={styles.labelWrap}>
        <Text
          variant={caps ? 'keyLabel' : size === 'sm' ? 'subhead' : 'bodyStrong'}
          weight={size === 'sm' && !caps ? 'semibold' : undefined}
          style={{ color: theme.color[labelToken] }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  fullWidth: { alignSelf: 'stretch' },
  labelWrap: { flexShrink: 1 },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { useContentInsets } from '../glass/chromeInsets';
import { GlassSurface } from '../glass/GlassSurface';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { Icon, type IconName } from './Icon';
import { focusRingStyle, useFocusRing } from './internal/interaction';

export type FloatingActionPlacement = 'end' | 'center';

export interface FloatingActionButtonProps {
  readonly label: string;
  readonly icon: IconName;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly placement?: FloatingActionPlacement;
  readonly offset?: number;
  readonly disabled?: boolean;
  readonly collapsed?: boolean;
  readonly testID?: string;
}

export const FAB_HEIGHT = 56;
export const FAB_GAP = space.sm;

export function floatingActionBottom(contentBottom: number, offset = 0): number {
  return contentBottom + FAB_GAP + offset;
}

export function FloatingActionButton({
  label,
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  placement = 'end',
  offset = 0,
  disabled = false,
  collapsed = false,
  testID,
}: FloatingActionButtonProps) {
  const theme = useTheme();
  const insets = useContentInsets();
  const focus = useFocusRing();
  const ink = disabled ? 'textSecondary' : 'accent';
  const pill = theme.glass.radius.pill;
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.anchor,
        { bottom: floatingActionBottom(insets.bottom, offset), paddingHorizontal: space.md + Math.max(insets.left, insets.right) },
        placement === 'center' ? styles.center : styles.end,
      ]}
    >
      <GlassSurface level="bar" radius={pill} elevated interactive={!disabled}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled }}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={onPress}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [
            styles.press,
            collapsed ? styles.collapsed : null,
            { borderRadius: pill },
            pressed && !disabled ? { backgroundColor: theme.glass.pressed } : null,
            focusRingStyle(theme, focus.focused),
          ]}
        >
          <Icon name={icon} size={24} color={ink} />
          {collapsed ? null : (
            <Text variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={1.5} style={{ color: theme.color[ink] }}>
              {label}
            </Text>
          )}
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0 },
  end: { alignItems: 'flex-end' },
  center: { alignItems: 'center' },
  press: {
    height: FAB_HEIGHT,
    minHeight: FAB_HEIGHT,
    minWidth: FAB_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
  },
  collapsed: { width: FAB_HEIGHT, paddingHorizontal: 0 },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { useInsets } from '../layout/useInsets';
import { Icon, type IconName } from '../primitives/Icon';
import { focusRingStyle, useFocusRing } from '../primitives/internal/interaction';
import { space, useTheme } from '../theme';
import { Text } from '../typography';

export interface TabBarItem {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  readonly testID?: string;
}

export interface TabBarProps {
  readonly items: readonly TabBarItem[];
  readonly bottomInset?: number;
}

export const TAB_BAR_HEIGHT = 56;
export const TAB_BAR_PADDING = 4;
export const TAB_BAR_MAX_WIDTH = 520;
export const TAB_BAR_GAP = 8;

export interface FloatingTabBarMetrics {
  readonly height: number;
  readonly bottom: number;
  readonly side: number;
  readonly footprint: number;
}

export function floatingTabBarMetrics(bottomInset: number): FloatingTabBarMetrics {
  const height = TAB_BAR_HEIGHT + TAB_BAR_PADDING * 2;
  const bottom = bottomInset > 0 ? Math.max(space.xs, bottomInset - space.sm) : space.sm;
  return { height, bottom, side: space.md, footprint: bottom + height + TAB_BAR_GAP };
}

interface TabBarButtonProps {
  readonly item: TabBarItem;
  readonly position: string;
}

function TabBarButton({ item, position }: TabBarButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const color = item.selected ? 'accent' : 'textSecondary';
  const lens = theme.glass.radius.pill;
  return (
    <Pressable
      testID={item.testID}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityHint={position}
      accessibilityState={{ selected: item.selected }}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.item,
        { borderRadius: lens },
        item.selected
          ? { backgroundColor: theme.glass.selection, borderWidth: theme.glass.rim.width, borderColor: theme.glass.selectionRim }
          : null,
        pressed ? { backgroundColor: theme.glass.pressed } : null,
        focusRingStyle(theme, focus.focused, 'inside'),
      ]}
    >
      <Icon name={item.icon} size={24} color={color} />
      <Text
        variant="label"
        weight={item.selected ? 'semibold' : 'medium'}
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
        style={[styles.caption, { color: theme.color[color] }]}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export function TabBar({ items, bottomInset }: TabBarProps) {
  const theme = useTheme();
  const insets = useInsets();
  const metrics = floatingTabBarMetrics(bottomInset ?? insets.bottom);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { paddingBottom: metrics.bottom, paddingHorizontal: metrics.side + Math.max(insets.left, insets.right) }]}
    >
      <GlassSurface
        accessibilityRole="tablist"
        level="bar"
        radius={theme.glass.radius.pill}
        elevated
        interactive
        style={[styles.bar, { height: metrics.height, padding: TAB_BAR_PADDING }]}
      >
        {items.map((item, index) => (
          <TabBarButton key={item.key} item={item} position={`${index + 1} of ${items.length}`} />
        ))}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'stretch', maxWidth: TAB_BAR_MAX_WIDTH, width: '100%' },
  item: { flex: 1, minWidth: 44, minHeight: 44, height: TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  caption: { textTransform: 'none', letterSpacing: 0 },
});

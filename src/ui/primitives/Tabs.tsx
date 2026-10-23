import { Pressable, StyleSheet, View } from 'react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { ScrollRow } from './ScrollRow';

export interface TabItem<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export interface TabsProps<K extends string> {
  readonly tabs: readonly TabItem<K>[];
  readonly selectedKey: K;
  readonly onSelect: (key: K) => void;
  readonly accessibilityLabel: string;
  readonly floating?: boolean;
  readonly testID?: string;
}

export const TAB_INDICATOR_HEIGHT = 3;

interface TabButtonProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly accessibilityHint: string;
  readonly selected: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
}

function TabButton({ label, accessibilityLabel, accessibilityHint, selected, testID, onPress }: TabButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.tab,
        { borderRadius: theme.radius.md },
        pressed ? { backgroundColor: theme.glass.pressed } : null,
        focusRingStyle(theme, focus.focused, 'inside'),
      ]}
    >
      <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={[
          styles.indicator,
          { height: TAB_INDICATOR_HEIGHT, borderRadius: TAB_INDICATOR_HEIGHT, backgroundColor: selected ? theme.color.accent : 'transparent' },
        ]}
      />
    </Pressable>
  );
}

export function Tabs<K extends string>({ tabs, selectedKey, onSelect, accessibilityLabel, floating = false, testID }: TabsProps<K>) {
  const theme = useTheme();
  const activeIndex = tabs.findIndex((tab) => tab.key === selectedKey);
  return (
    <GlassSurface level="bar" rim="bottom" blur={floating} style={styles.root}>
      <ScrollRow
        testID={testID}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        activeIndex={activeIndex >= 0 ? activeIndex : undefined}
        fadeColor={theme.glass.level.bar.opaque}
      >
        {tabs.map((tab, index) => (
          <TabButton
            key={tab.key}
            label={tab.label}
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            accessibilityHint={`${index + 1} of ${tabs.length}`}
            selected={tab.key === selectedKey}
            testID={tab.testID}
            onPress={() => onSelect(tab.key)}
          />
        ))}
      </ScrollRow>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  tab: {
    height: 44,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: { position: 'absolute', left: space.sm, right: space.sm, bottom: 0 },
});

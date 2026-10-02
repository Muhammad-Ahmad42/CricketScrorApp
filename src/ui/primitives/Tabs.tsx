import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { focusRingStyle, useFocusRing } from './internal/interaction';

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

interface TabButtonProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly accessibilityHint: string;
  readonly selected: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

function TabButton({ label, accessibilityLabel, accessibilityHint, selected, testID, onPress, onLayout }: TabButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLayout={onLayout}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={[styles.tab, focusRingStyle(theme, focus.focused, 'inside')]}
    >
      <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'primary' : 'secondary'} numberOfLines={1}>
        {label}
      </Text>
      <View
        style={[
          styles.indicator,
          { height: theme.borderWidth.emphasis, backgroundColor: selected ? theme.color.accent : 'transparent' },
        ]}
      />
    </Pressable>
  );
}

export function Tabs<K extends string>({ tabs, selectedKey, onSelect, accessibilityLabel, floating = false, testID }: TabsProps<K>) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    const x = offsets.current.get(selectedKey);
    if (x !== undefined) {
      scroll.current?.scrollTo({ x: Math.max(0, x - space.md), animated: !theme.motion.reduced });
    }
  }, [selectedKey, theme.motion.reduced]);

  return (
    <GlassSurface level="bar" rim="bottom" blur={floating} style={styles.root}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={testID}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={styles.content}
      >
        {tabs.map((tab, index) => {
          const selected = tab.key === selectedKey;
          return (
            <TabButton
              key={tab.key}
              label={tab.label}
              accessibilityLabel={tab.accessibilityLabel ?? tab.label}
              accessibilityHint={`${index + 1} of ${tabs.length}`}
              selected={selected}
              testID={tab.testID}
              onPress={() => onSelect(tab.key)}
              onLayout={(event: LayoutChangeEvent) => {
                offsets.current.set(tab.key, event.nativeEvent.layout.x);
              }}
            />
          );
        })}
      </ScrollView>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  content: { paddingHorizontal: space.xs },
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

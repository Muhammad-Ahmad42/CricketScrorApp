import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';

export interface ChoiceRowProps {
  readonly title: string;
  readonly detail?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const MARK = 22;
const DOT = 10;

function RadioMark({ selected, disabled }: { readonly selected: boolean; readonly disabled: boolean }) {
  const theme = useTheme();
  const ring = disabled ? theme.color.border : selected ? theme.color.accent : theme.color.borderStrong;
  return (
    <View
      style={[styles.mark, { borderColor: ring, borderWidth: theme.borderWidth.emphasis }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {selected ? <View style={[styles.dot, { backgroundColor: disabled ? theme.color.textMuted : theme.color.accent }]} /> : null}
    </View>
  );
}

export function ChoiceRow({ title, detail, selected, onSelect, destructive = false, disabled = false, testID }: ChoiceRowProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const label = detail ? `${title}, ${detail}` : title;
  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected, selected, disabled }}
        disabled={disabled}
        onPress={selected ? undefined : onSelect}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.row,
          { minHeight: theme.size.sheetChoice, backgroundColor: pressed && !disabled ? theme.color.surfaceSunken : 'transparent' },
          focused ? { outlineColor: theme.color.focusRing, outlineWidth: theme.borderWidth.focus, outlineOffset: -2, outlineStyle: 'solid' } : null,
        ]}
      >
        <RadioMark selected={selected} disabled={disabled} />
        <View style={styles.text}>
          <Text variant="body" weight={selected ? 'semibold' : 'regular'} tone={disabled ? 'muted' : 'primary'}>
            {title}
          </Text>
          {detail ? (
            <View style={styles.detail}>
              {destructive ? <Icon name="triangle-alert" size={16} color="danger" /> : null}
              <Text variant="footnote" tone={destructive ? 'danger' : 'secondary'} style={styles.detailText}>
                {detail}
              </Text>
            </View>
          ) : null}
        </View>
        {selected ? <Icon name="check" size={20} color="accent" /> : null}
      </Pressable>
      <Separator inset={space.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  mark: { width: MARK, height: MARK, borderRadius: MARK / 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  text: { flex: 1, gap: space.xxs },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xxs },
  detailText: { flex: 1 },
});

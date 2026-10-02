import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, space, useTheme } from '@/ui';

export interface ChipOption {
  readonly key: string;
  readonly label: string;
  readonly accessibilityLabel?: string;
}

export interface ChipRowProps {
  readonly options: readonly ChipOption[];
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  readonly accessibilityLabel: string;
  readonly testIDPrefix: string;
}

export function ChipRow({ options, selected, onSelect, accessibilityLabel, testIDPrefix }: ChipRowProps) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <Pressable
            key={option.key}
            testID={`${testIDPrefix}-${option.key}`}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.key)}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: theme.radius.md,
                borderWidth: active ? theme.borderWidth.emphasis : theme.borderWidth.control,
                borderColor: active ? theme.color.accent : theme.color.borderStrong,
                backgroundColor: active ? theme.color.accentSubtle : pressed ? theme.color.surfaceSunken : theme.color.surface,
              },
            ]}
          >
            <Text variant="subhead" weight={active ? 'semibold' : 'medium'} tone={active ? 'accent' : 'primary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, paddingHorizontal: space.md },
  chip: { minHeight: 44, minWidth: 48, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
});

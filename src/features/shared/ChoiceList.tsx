import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Separator, Text, space, useTheme } from '@/ui';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export interface ChoiceListProps<T extends string> {
  readonly choices: readonly Choice<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

export function ChoiceList<T extends string>({ choices, value, onChange, accessibilityLabel, testID }: ChoiceListProps<T>) {
  const theme = useTheme();
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {choices.map((choice, index) => {
        const selected = choice.value === value;
        const disabled = choice.disabled ?? false;
        return (
          <View key={choice.value}>
            <Pressable
              testID={choice.testID}
              accessibilityRole="radio"
              accessibilityLabel={choice.description ? `${choice.label}. ${choice.description}` : choice.label}
              accessibilityState={{ selected, checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(choice.value)}
              style={({ pressed }) => [
                styles.row,
                { minHeight: theme.size.sheetChoice, backgroundColor: pressed ? theme.color.surfaceSunken : 'transparent' },
              ]}
            >
              <View
                style={[
                  styles.radio,
                  {
                    borderRadius: theme.radius.sm,
                    borderColor: selected ? theme.color.accent : theme.color.borderStrong,
                    borderWidth: selected ? theme.borderWidth.emphasis : theme.borderWidth.control,
                  },
                ]}
              >
                {selected ? <Icon name="check" size={16} color="accent" /> : null}
              </View>
              <View style={styles.text}>
                <Text variant="body" weight={selected ? 'semibold' : undefined} tone={disabled ? 'muted' : 'primary'}>
                  {choice.label}
                </Text>
                {choice.description ? (
                  <Text variant="footnote" tone="secondary">
                    {choice.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {index < choices.length - 1 ? <Separator inset={space.md + 28} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, minWidth: 44 },
  radio: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});

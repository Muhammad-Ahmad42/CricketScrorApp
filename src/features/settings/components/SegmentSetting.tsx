import { StyleSheet, View } from 'react-native';
import { SegmentedControl, Separator, Text, space, useTheme } from '@/ui';
import type { Choice } from '../selectors/settings';

export interface SegmentSettingProps<T extends string> {
  readonly title: string;
  readonly helper?: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function SegmentSetting<T extends string>({ title, helper, choices, value, onChange, disabled = false, testID }: SegmentSettingProps<T>) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.color.surface }}>
      <View style={styles.body}>
        <Text variant="body">
          {title}
        </Text>
        {helper ? (
          <Text variant="footnote" tone="secondary">
            {helper}
          </Text>
        ) : null}
        <View style={styles.control}>
          <SegmentedControl
            options={choices.map((choice) => ({
              value: choice.value,
              label: choice.label,
              accessibilityLabel: choice.accessibilityLabel,
              testID: choice.testID,
            }))}
            value={value}
            onChange={onChange}
            accessibilityLabel={title}
            disabled={disabled}
            testID={testID}
          />
        </View>
      </View>
      <Separator inset={space.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xxs },
  control: { marginTop: space.xs },
});

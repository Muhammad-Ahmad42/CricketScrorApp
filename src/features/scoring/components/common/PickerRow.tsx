import { StyleSheet, View } from 'react-native';
import { Icon, PressableRow, Text, space } from '@/ui';

export interface PickerRowProps {
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
  readonly placeholder?: boolean;
  readonly required?: boolean;
  readonly expanded?: boolean;
  readonly inset?: boolean;
  readonly testID?: string;
}

export function PickerRow({ label, value, onPress, placeholder = false, required = false, expanded = false, inset = true, testID }: PickerRowProps) {
  const missing = placeholder && required;
  return (
    <PressableRow
      testID={testID}
      accessibilityLabel={`${label}, ${value}${missing ? ', required' : ''}`}
      accessibilityHint={onPress ? 'Opens a list to choose from' : undefined}
      onPress={onPress}
      inset={inset}
      transparent
    >
      <View style={styles.text}>
        <Text variant="footnote" tone="secondary">
          {missing ? `${label} · required` : label}
        </Text>
        <Text variant={placeholder ? 'body' : 'bodyStrong'} tone={placeholder ? 'secondary' : 'primary'}>
          {value}
        </Text>
      </View>
      {onPress ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="textSecondary" /> : null}
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  text: { flex: 1, minWidth: 0, gap: space.xxs },
});

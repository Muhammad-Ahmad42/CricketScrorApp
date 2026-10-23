import { StyleSheet, View } from 'react-native';
import { IconButton, TextField, space } from '@/ui';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly accessibilityLabel: string;
  readonly placeholder: string;
  readonly testID?: string;
}

export function SearchField({ value, onChangeText, accessibilityLabel, placeholder, testID }: SearchFieldProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          label={accessibilityLabel}
          hideLabel
          value={value}
          onChangeText={onChangeText}
          leadingIcon="search"
          placeholder={placeholder}
          returnKeyType="search"
          autoCapitalize="none"
          testID={testID}
        />
      </View>
      {value !== '' ? <IconButton icon="x" accessibilityLabel="Clear search" onPress={() => onChangeText('')} testID={testID ? `${testID}-clear` : undefined} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'stretch' },
  field: { flex: 1, minWidth: 0 },
});

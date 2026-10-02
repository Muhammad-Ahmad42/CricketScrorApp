import { useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ListRow, Sheet, Text, TextField, space } from '@/ui';

export interface PickerOption {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly monogram?: string;
  readonly disabled?: boolean;
}

export interface PickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly options: readonly PickerOption[];
  readonly onPick: (key: string) => void;
  readonly onClose: () => void;
  readonly searchable?: boolean;
  readonly emptyText?: string;
  readonly testIDPrefix?: string;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly testID?: string;
}

export function PickerSheet({
  visible,
  title,
  subtitle,
  options,
  onPick,
  onClose,
  searchable = false,
  emptyText = 'Nothing to choose from.',
  testIDPrefix = 'picker',
  header,
  footer,
  testID = 'sheet-picker',
}: PickerSheetProps) {
  const window = useWindowDimensions();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = needle.length === 0 ? options : options.filter((option) => `${option.title} ${option.subtitle ?? ''}`.toLowerCase().includes(needle));
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} scrollable={false} footer={footer} testID={testID}>
      <View style={styles.body}>
        {header}
        {searchable ? (
          <TextField
            label="Search"
            value={query}
            onChangeText={setQuery}
            leadingIcon="search"
            autoCapitalize="none"
            testID={`${testIDPrefix}-input-search`}
          />
        ) : null}
        {shown.length === 0 ? (
          <Text variant="callout" tone="secondary" testID={`${testIDPrefix}-text-empty`}>
            {emptyText}
          </Text>
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(option) => option.key}
            style={{ maxHeight: window.height * 0.5 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            renderItem={({ item, index }) => (
              <ListRow
                title={item.title}
                subtitle={item.subtitle}
                leading={item.monogram ? { monogram: item.monogram } : undefined}
                disabled={item.disabled}
                onPress={() => onPick(item.key)}
                testID={`${testIDPrefix}-row-${index + 1}`}
              />
            )}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
});

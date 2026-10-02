import { StyleSheet, View } from 'react-native';
import { ListRow, Sheet, Text, space, type IconName } from '@/ui';

export interface SheetAction {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
}

export interface ActionSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly actions: readonly SheetAction[];
  readonly note?: string | null;
  readonly onClose: () => void;
  readonly testID?: string;
}

export function ActionSheet({ visible, title, subtitle, actions, note, onClose, testID = 'sheet-actions' }: ActionSheetProps) {
  return (
    <Sheet visible={visible} title={title} subtitle={subtitle} onClose={onClose} testID={testID}>
      <View style={styles.body}>
        {actions.map((action) => (
          <ListRow
            key={action.key}
            title={action.label}
            subtitle={action.description}
            leading={action.icon ? { icon: action.icon } : undefined}
            onPress={action.onPress}
            disabled={action.disabled}
            trailing={{ kind: 'chevron' }}
            testID={action.testID}
          />
        ))}
        {note ? (
          <Text variant="footnote" tone="secondary" style={styles.note}>
            {note}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.xxs },
  note: { paddingTop: space.xs },
});

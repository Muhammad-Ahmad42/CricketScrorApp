import { StyleSheet, View } from 'react-native';
import { ActionRow, Sheet, Text, space, type IconName } from '@/ui';

export interface SheetAction {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly kind?: 'navigate' | 'action';
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
      <View>
        {actions.map((action, index) => (
          <ActionRow
            key={action.key}
            choice={{
              key: action.key,
              title: action.label,
              subtitle: action.description,
              icon: action.icon,
              kind: action.kind ?? (action.label.endsWith('…') ? 'navigate' : 'action'),
              disabled: action.disabled,
              destructive: action.destructive,
              onPress: action.onPress,
            }}
            separator={index < actions.length - 1}
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
  note: { paddingTop: space.sm },
});

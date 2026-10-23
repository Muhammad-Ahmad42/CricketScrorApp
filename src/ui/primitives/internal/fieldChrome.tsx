import { StyleSheet, View, type ViewStyle } from 'react-native';
import { space, type Theme } from '../../theme';
import { Text } from '../../typography';
import { Icon } from '../Icon';

export interface FieldBoxState {
  readonly focused: boolean;
  readonly error: boolean;
  readonly disabled: boolean;
}

export function fieldBoxStyle(theme: Theme, { focused, error, disabled }: FieldBoxState): ViewStyle {
  const borderWidth = error || focused ? theme.borderWidth.emphasis : theme.borderWidth.control;
  return {
    minHeight: theme.size.field,
    backgroundColor: disabled ? theme.color.surfaceSunken : theme.color.surface,
    borderColor: error ? theme.color.danger : focused ? theme.color.accent : theme.color.borderStrong,
    borderWidth,
    borderRadius: theme.radius.md,
    paddingLeft: space.sm - (borderWidth - theme.borderWidth.control),
    paddingRight: space.xxs,
  };
}

export interface FieldLabelProps {
  readonly label: string;
  readonly hidden?: boolean;
}

export function FieldLabel({ label, hidden = false }: FieldLabelProps) {
  if (hidden) {
    return null;
  }
  return (
    <Text variant="subhead" tone="secondary" accessible={false} importantForAccessibility="no">
      {label}
    </Text>
  );
}

export interface FieldMessageProps {
  readonly helper?: string | null;
  readonly error?: string | null;
  readonly testID?: string;
}

export function FieldMessage({ helper, error, testID }: FieldMessageProps) {
  if (error) {
    return (
      <View style={styles.message} accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
        <Icon name="circle-alert" size={16} color="danger" />
        <Text variant="footnote" tone="danger" style={styles.messageText}>
          {error}
        </Text>
      </View>
    );
  }
  if (helper) {
    return (
      <Text variant="footnote" tone="muted" testID={testID}>
        {helper}
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  messageText: { flexShrink: 1 },
});

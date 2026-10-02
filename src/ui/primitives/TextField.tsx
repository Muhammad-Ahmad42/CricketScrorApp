import { useState } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from 'react-native';
import { space, useTheme } from '../theme';
import { Text, maxScaleFor, textStyle } from '../typography';
import { Icon, type IconName } from './Icon';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly helper?: string;
  readonly error?: string | null;
  readonly numeric?: boolean;
  readonly multiline?: boolean;
  readonly editable?: boolean;
  readonly autoFocus?: boolean;
  readonly maxLength?: number;
  readonly leadingIcon?: IconName;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly onSubmitEditing?: () => void;
  readonly onBlur?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export function fieldAccessibilityLabel(label: string, error: string | null | undefined): string {
  return error ? `${label}, ${error}` : label;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  numeric = false,
  multiline = false,
  editable = true,
  autoFocus,
  maxLength,
  leadingIcon,
  keyboardType,
  returnKeyType,
  autoCapitalize,
  onSubmitEditing,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const borderColor = hasError ? theme.color.danger : focused ? theme.color.accent : theme.color.borderStrong;
  const borderWidth = hasError || focused ? theme.borderWidth.emphasis : theme.borderWidth.control;
  const inputVariant = numeric ? 'tableNumeric' : 'body';
  return (
    <View style={styles.root}>
      <Text variant="subhead" tone="secondary" accessible={false} importantForAccessibility="no">
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? theme.size.fieldMultiline : theme.size.field,
            backgroundColor: editable ? theme.color.surface : theme.color.surfaceSunken,
            borderColor,
            borderWidth,
            borderRadius: theme.radius.md,
            paddingHorizontal: space.sm - (borderWidth - theme.borderWidth.control),
          },
        ]}
      >
        {leadingIcon ? <Icon name={leadingIcon} size={20} color="textSecondary" /> : null}
        <TextInput
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? fieldAccessibilityLabel(label, error)}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: !editable }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textMuted}
          editable={editable}
          autoFocus={autoFocus}
          maxLength={maxLength}
          multiline={multiline}
          keyboardType={keyboardType ?? (numeric ? 'number-pad' : 'default')}
          returnKeyType={returnKeyType}
          autoCapitalize={autoCapitalize}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          selectionColor={theme.color.accent}
          maxFontSizeMultiplier={maxScaleFor(inputVariant)}
          style={[
            textStyle(inputVariant, theme),
            styles.input,
            numeric ? styles.numeric : null,
            multiline ? styles.multiline : null,
          ]}
        />
      </View>
      {hasError ? (
        <View style={styles.message} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name="circle-alert" size={16} color="danger" />
          <Text variant="footnote" tone="danger" style={styles.messageText}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="footnote" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs, alignSelf: 'stretch' },
  field: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  input: { flex: 1, minHeight: 44, paddingVertical: 0 },
  numeric: { textAlign: 'right' },
  multiline: { textAlignVertical: 'top', paddingVertical: space.sm, alignSelf: 'stretch' },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  messageText: { flexShrink: 1 },
});

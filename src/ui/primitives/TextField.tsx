import { useCallback, useEffect, useRef, useState, type Ref, type RefObject } from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions, type TextStyle } from 'react-native';
import { useKeyboardField } from '../layout/keyboard';
import { space, useTheme } from '../theme';
import { Text, maxScaleFor, textStyle } from '../typography';
import { showKeyboardFor, type SubmitBehavior } from './formChain';
import { Icon, type IconName } from './Icon';
import { useOverlayReady } from './internal/overlayReady';

export type NumericKind = 'integer' | 'decimal';

export function numericKind(numeric: boolean | NumericKind | undefined): NumericKind | null {
  if (numeric === true || numeric === 'integer') {
    return 'integer';
  }
  return numeric === 'decimal' ? 'decimal' : null;
}

export function keyboardTypeFor(numeric: NumericKind | null, explicit?: KeyboardTypeOptions): KeyboardTypeOptions {
  if (explicit !== undefined) {
    return explicit;
  }
  if (numeric === 'integer') {
    return 'number-pad';
  }
  return numeric === 'decimal' ? 'decimal-pad' : 'default';
}

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly helper?: string;
  readonly error?: string | null;
  readonly numeric?: boolean | NumericKind;
  readonly multiline?: boolean;
  readonly editable?: boolean;
  readonly autoFocus?: boolean;
  readonly maxLength?: number;
  readonly leadingIcon?: IconName;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly autoCorrect?: boolean;
  readonly submitBehavior?: SubmitBehavior;
  readonly onSubmitEditing?: () => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly hideLabel?: boolean;
  readonly ref?: Ref<TextInput>;
  readonly testID?: string;
}

export const WEB_INPUT_RESET: TextStyle | null =
  Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0, width: '100%', minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' } as unknown as TextStyle) : null;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    (ref as RefObject<T | null>).current = value;
  }
}

export const AUTOFOCUS_RETRY_MS = 250;
export const AUTOFOCUS_RETRIES = 3;

function useDeferredAutoFocus(autoFocus: boolean | undefined) {
  const overlay = useOverlayReady();
  const input = useRef<TextInput | null>(null);
  const done = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferred = autoFocus === true && overlay !== null && Platform.OS === 'android';
  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );
  useEffect(() => {
    if (!deferred || overlay !== true || done.current) {
      return;
    }
    done.current = true;
    input.current?.focus();
    let tries = 0;
    const retry = () => {
      timer.current = null;
      const current = input.current;
      if (current === null || Keyboard.isVisible() || !current.isFocused() || tries >= AUTOFOCUS_RETRIES) {
        return;
      }
      tries += 1;
      showKeyboardFor(current);
      timer.current = setTimeout(retry, AUTOFOCUS_RETRY_MS);
    };
    timer.current = setTimeout(retry, AUTOFOCUS_RETRY_MS);
  }, [deferred, overlay]);
  return { input, autoFocus: deferred ? false : autoFocus };
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
  autoCorrect,
  submitBehavior,
  onSubmitEditing,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  hideLabel = false,
  ref,
  testID,
}: TextFieldProps) {
  const theme = useTheme();
  const keyboard = useKeyboardField<View>();
  const focusing = useDeferredAutoFocus(autoFocus);
  const inputRef = focusing.input;
  const setInput = useCallback(
    (node: TextInput | null) => {
      inputRef.current = node;
      assignRef(ref, node);
    },
    [ref, inputRef],
  );
  const [focused, setFocused] = useState(false);
  const kind = numericKind(numeric);
  const hasError = Boolean(error);
  const borderColor = hasError ? theme.color.danger : focused ? theme.color.accent : theme.color.borderStrong;
  const borderWidth = hasError || focused ? theme.borderWidth.emphasis : theme.borderWidth.control;
  const inputVariant = kind !== null ? 'tableNumeric' : 'body';
  return (
    <View ref={keyboard.ref} style={styles.root}>
      {hideLabel ? null : (
        <Text variant="subhead" tone="secondary" accessible={false} importantForAccessibility="no">
          {label}
        </Text>
      )}
      <View
        ref={keyboard.coreRef}
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
          ref={setInput}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? fieldAccessibilityLabel(label, error)}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled: !editable }}
          aria-disabled={!editable}
          aria-invalid={hasError}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.textMuted}
          editable={editable}
          autoFocus={focusing.autoFocus}
          maxLength={maxLength}
          multiline={multiline}
          keyboardType={keyboardTypeFor(kind, keyboardType)}
          inputMode={Platform.OS === 'web' && keyboardType === undefined && kind !== null ? (kind === 'decimal' ? 'decimal' : 'numeric') : undefined}
          returnKeyType={returnKeyType}
          submitBehavior={submitBehavior ?? (multiline ? undefined : returnKeyType === 'next' ? 'submit' : undefined)}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => {
            setFocused(true);
            keyboard.onFocus();
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            keyboard.onBlur();
            onBlur?.();
          }}
          selectionColor={theme.color.accent}
          maxFontSizeMultiplier={maxScaleFor(inputVariant)}
          style={[
            textStyle(inputVariant, theme),
            styles.input,
            multiline ? styles.multiline : null,
            WEB_INPUT_RESET,
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
  root: { gap: space.xs, alignSelf: 'stretch', minWidth: 0 },
  field: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0 },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 0 },
  multiline: { textAlignVertical: 'top', paddingVertical: space.sm, alignSelf: 'stretch' },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  messageText: { flexShrink: 1 },
});

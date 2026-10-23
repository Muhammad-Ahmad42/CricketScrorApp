import { useRef, useState, type CSSProperties } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { formatDayLabel, formatTimeLabel, spokenDayLabel, type IsoDate, type LocalTime } from './dateTime';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { FieldLabel, FieldMessage, fieldBoxStyle } from './internal/fieldChrome';
import { focusRingStyle, useFocusRing } from './internal/interaction';

export type MinuteInterval = 1 | 5 | 10 | 15 | 30;

interface PickerFieldBaseProps {
  readonly label: string;
  readonly placeholder?: string;
  readonly helper?: string;
  readonly error?: string | null;
  readonly optional?: boolean;
  readonly disabled?: boolean;
  readonly hideLabel?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

export interface DateFieldProps extends PickerFieldBaseProps {
  readonly value: IsoDate | null;
  readonly onChange: (value: IsoDate | null) => void;
  readonly minimumDate?: IsoDate | null;
  readonly maximumDate?: IsoDate | null;
}

export interface TimeFieldProps extends PickerFieldBaseProps {
  readonly value: LocalTime | null;
  readonly onChange: (value: LocalTime | null) => void;
  readonly minuteInterval?: MinuteInterval;
}

export const DATE_PLACEHOLDER = 'Choose date';
export const TIME_PLACEHOLDER = 'Choose time';

export function pickerFieldLabel(label: string, spoken: string | null, error: string | null | undefined): string {
  const value = spoken ?? 'not set';
  return error ? `${label}, ${value}, ${error}` : `${label}, ${value}`;
}

const HIDDEN_INPUT: CSSProperties = {
  position: 'absolute',
  left: 0,
  bottom: 0,
  width: 1,
  height: 1,
  opacity: 0,
  border: 0,
  padding: 0,
  pointerEvents: 'none',
};

interface NativeInputProps extends PickerFieldBaseProps {
  readonly type: 'date' | 'time';
  readonly icon: IconName;
  readonly value: string | null;
  readonly display: string | null;
  readonly spoken: string | null;
  readonly fallbackPlaceholder: string;
  readonly defaultHint: string;
  readonly min?: string;
  readonly max?: string;
  readonly step?: number;
  readonly onChange: (value: string | null) => void;
}

interface PickerInput {
  showPicker?: () => void;
  focus: () => void;
  click: () => void;
}

function openNativePicker(input: PickerInput | null): void {
  if (input === null) {
    return;
  }
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch {
    input.focus();
  }
  input.focus();
  input.click();
}

function NativeInputField({
  type,
  icon,
  label,
  value,
  display,
  spoken,
  placeholder,
  fallbackPlaceholder,
  helper,
  error,
  optional = false,
  disabled = false,
  hideLabel = false,
  accessibilityHint,
  defaultHint,
  min,
  max,
  step,
  onChange,
  testID,
}: NativeInputProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const clearable = optional && display !== null && !disabled;
  return (
    <View style={styles.root}>
      <FieldLabel label={label} hidden={hideLabel} />
      <View style={[styles.box, fieldBoxStyle(theme, { focused: active, error: Boolean(error), disabled })]}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={pickerFieldLabel(label, spoken, error)}
          accessibilityHint={accessibilityHint ?? defaultHint}
          aria-disabled={disabled}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          onPress={() => openNativePicker(input.current)}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [styles.press, pressed && !disabled ? { opacity: 0.72 } : null, focusRingStyle(theme, focus.focused, 'inside')]}
        >
          <Icon name={icon} size={20} color={disabled ? 'textMuted' : 'textSecondary'} />
          <Text variant="body" tone={display === null || disabled ? 'muted' : 'primary'} numberOfLines={1} style={styles.value} testID={testID ? `${testID}-value` : undefined}>
            {display ?? placeholder ?? fallbackPlaceholder}
          </Text>
        </Pressable>
        <input
          ref={input}
          type={type}
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next === '' ? null : next);
          }}
          style={HIDDEN_INPUT}
        />
        {clearable ? <IconButton icon="x" accessibilityLabel={`Clear ${label}`} onPress={() => onChange(null)} testID={testID ? `${testID}-clear` : undefined} /> : null}
      </View>
      <FieldMessage helper={helper} error={error} />
    </View>
  );
}

export function DateField({ value, onChange, minimumDate, maximumDate, ...rest }: DateFieldProps) {
  return (
    <NativeInputField
      {...rest}
      type="date"
      icon="calendar"
      value={value}
      display={formatDayLabel(value)}
      spoken={spokenDayLabel(value)}
      fallbackPlaceholder={DATE_PLACEHOLDER}
      defaultHint="Opens a date picker"
      min={minimumDate ?? undefined}
      max={maximumDate ?? undefined}
      onChange={onChange}
    />
  );
}

export function TimeField({ value, onChange, minuteInterval, ...rest }: TimeFieldProps) {
  return (
    <NativeInputField
      {...rest}
      type="time"
      icon="clock"
      value={value}
      display={formatTimeLabel(value)}
      spoken={formatTimeLabel(value)}
      fallbackPlaceholder={TIME_PLACEHOLDER}
      defaultHint="Opens a time picker"
      step={minuteInterval === undefined ? undefined : minuteInterval * 60}
      onChange={onChange}
    />
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs, alignSelf: 'stretch', minWidth: 0 },
  box: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  press: { flex: 1, minHeight: 44, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  value: { flex: 1, minWidth: 0 },
});

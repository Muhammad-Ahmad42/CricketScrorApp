import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { Button } from './Button';
import {
  clampDate,
  formatDayLabel,
  formatTimeLabel,
  isoDateToLocal,
  localToIsoDate,
  localToTime,
  spokenDayLabel,
  timeToLocal,
  type IsoDate,
  type LocalTime,
} from './dateTime';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { FieldLabel, FieldMessage, fieldBoxStyle } from './internal/fieldChrome';
import { focusRingStyle, useFocusRing } from './internal/interaction';
import { Sheet } from './Sheet';

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

interface FieldButtonProps extends PickerFieldBaseProps {
  readonly icon: IconName;
  readonly display: string | null;
  readonly spoken: string | null;
  readonly fallbackPlaceholder: string;
  readonly defaultHint: string;
  readonly active: boolean;
  readonly onOpen: () => void;
  readonly onClear: () => void;
}

export function pickerFieldLabel(label: string, spoken: string | null, error: string | null | undefined): string {
  const value = spoken ?? 'not set';
  return error ? `${label}, ${value}, ${error}` : `${label}, ${value}`;
}

function FieldButton({
  label,
  placeholder,
  helper,
  error,
  optional = false,
  disabled = false,
  hideLabel = false,
  accessibilityHint,
  testID,
  icon,
  display,
  spoken,
  fallbackPlaceholder,
  defaultHint,
  active,
  onOpen,
  onClear,
}: FieldButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
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
          accessibilityState={{ disabled, expanded: active }}
          aria-disabled={disabled}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          onPress={onOpen}
          onFocus={focus.onFocus}
          onBlur={focus.onBlur}
          style={({ pressed }) => [styles.press, pressed && !disabled ? { opacity: 0.72 } : null, focusRingStyle(theme, focus.focused, 'inside')]}
        >
          <Icon name={icon} size={20} color={disabled ? 'textMuted' : 'textSecondary'} />
          <Text
            variant="body"
            tone={display === null || disabled ? 'muted' : 'primary'}
            numberOfLines={1}
            style={styles.value}
            testID={testID ? `${testID}-value` : undefined}
          >
            {display ?? placeholder ?? fallbackPlaceholder}
          </Text>
        </Pressable>
        {clearable ? <IconButton icon="x" accessibilityLabel={`Clear ${label}`} onPress={onClear} testID={testID ? `${testID}-clear` : undefined} /> : null}
      </View>
      <FieldMessage helper={helper} error={error} />
    </View>
  );
}

interface PickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly mode: 'date' | 'time';
  readonly seed: Date;
  readonly minimumDate?: Date;
  readonly maximumDate?: Date;
  readonly minuteInterval?: MinuteInterval;
  readonly clearable: boolean;
  readonly onPick: (date: Date) => void;
  readonly onClear: () => void;
  readonly onClose: (draft: Date, touched: boolean) => void;
  readonly testID?: string;
}

function PickerSheet({ visible, title, mode, seed, minimumDate, maximumDate, minuteInterval, clearable, onPick, onClear, onClose, testID }: PickerSheetProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(seed);
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setDraft(seed);
      setTouched(false);
    }
  }
  const change = (_event: unknown, date: Date) => {
    setDraft(date);
    setTouched(true);
    onPick(date);
  };
  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={() => onClose(draft, touched)}
      testID={testID}
      footer={
        <View style={styles.actions}>
          {clearable ? (
            <View style={styles.action}>
              <Button label="Clear" variant="secondary" fullWidth onPress={onClear} testID={testID ? `${testID}-clear` : undefined} />
            </View>
          ) : null}
          <View style={styles.action}>
            <Button label="Done" fullWidth onPress={() => onClose(draft, true)} testID={testID ? `${testID}-done` : undefined} />
          </View>
        </View>
      }
    >
      <View style={styles.picker}>
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={draft}
          mode={mode}
          display={mode === 'date' ? 'inline' : 'spinner'}
          onValueChange={change}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          minuteInterval={minuteInterval}
          locale="en-GB"
          themeVariant={theme.scheme}
          accentColor={theme.color.accent}
          textColor={theme.color.textPrimary}
        />
      </View>
    </Sheet>
  );
}

function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

export function DateField(props: DateFieldProps) {
  const { label, value, onChange, minimumDate, maximumDate, optional = false, testID } = props;
  const [open, setOpen] = useState(false);
  const current = isoDateToLocal(value);
  const minimum = isoDateToLocal(minimumDate);
  const maximum = isoDateToLocal(maximumDate);
  const seed = clampDate(current ?? today(), minimum, maximum);
  const commit = (date: Date) => onChange(localToIsoDate(date));
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'date',
        minimumDate: minimum ?? undefined,
        maximumDate: maximum ?? undefined,
        onValueChange: (_event, date) => commit(date),
      });
      return;
    }
    setOpen(true);
  };
  return (
    <>
      <FieldButton
        {...props}
        icon="calendar"
        display={formatDayLabel(value)}
        spoken={spokenDayLabel(value)}
        fallbackPlaceholder={DATE_PLACEHOLDER}
        defaultHint="Opens a date picker"
        active={open}
        onOpen={openPicker}
        onClear={() => onChange(null)}
      />
      {Platform.OS === 'android' ? null : (
        <PickerSheet
          visible={open}
          title={label}
          mode="date"
          seed={seed}
          minimumDate={minimum ?? undefined}
          maximumDate={maximum ?? undefined}
          clearable={optional && value !== null}
          onPick={commit}
          onClear={() => {
            onChange(null);
            setOpen(false);
          }}
          onClose={(draft, touched) => {
            if (touched && value === null) {
              commit(draft);
            }
            setOpen(false);
          }}
          testID={testID ? `${testID}-sheet` : undefined}
        />
      )}
    </>
  );
}

export function TimeField(props: TimeFieldProps) {
  const { label, value, onChange, minuteInterval, optional = false, testID } = props;
  const [open, setOpen] = useState(false);
  const seed = timeToLocal(value) ?? new Date();
  const commit = (date: Date) => onChange(localToTime(date));
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: seed,
        mode: 'time',
        is24Hour: true,
        minuteInterval,
        onValueChange: (_event, date) => commit(date),
      });
      return;
    }
    setOpen(true);
  };
  return (
    <>
      <FieldButton
        {...props}
        icon="clock"
        display={formatTimeLabel(value)}
        spoken={formatTimeLabel(value)}
        fallbackPlaceholder={TIME_PLACEHOLDER}
        defaultHint="Opens a time picker"
        active={open}
        onOpen={openPicker}
        onClear={() => onChange(null)}
      />
      {Platform.OS === 'android' ? null : (
        <PickerSheet
          visible={open}
          title={label}
          mode="time"
          seed={seed}
          minuteInterval={minuteInterval}
          clearable={optional && value !== null}
          onPick={commit}
          onClear={() => {
            onChange(null);
            setOpen(false);
          }}
          onClose={(draft, touched) => {
            if (touched && value === null) {
              commit(draft);
            }
            setOpen(false);
          }}
          testID={testID ? `${testID}-sheet` : undefined}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs, alignSelf: 'stretch', minWidth: 0 },
  box: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  press: { flex: 1, minHeight: 44, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  value: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: space.xs },
  action: { flex: 1 },
  picker: { alignItems: 'stretch' },
});

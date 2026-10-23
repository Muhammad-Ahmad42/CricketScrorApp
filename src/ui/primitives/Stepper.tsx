import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type AccessibilityActionEvent } from 'react-native';
import { space, useTheme } from '../theme';
import { Text, textStyle } from '../typography';
import { Icon } from './Icon';

export interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly formatValue?: (value: number) => string;
  readonly editable?: boolean;
  readonly disabled?: boolean;
  readonly hideLabel?: boolean;
  readonly caption?: string;
  readonly testID?: string;
}

export const REPEAT_DELAY_MS = 400;
export const REPEAT_INTERVAL_MS = 100;

export function clampStep(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  formatValue = String,
  editable = true,
  disabled = false,
  hideLabel = false,
  caption,
  testID,
}: StepperProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const valueRef = useRef(value);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const stopRepeat = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => stopRepeat, []);

  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  const nudge = (direction: 1 | -1) => {
    const next = clampStep(valueRef.current + direction * step, min, max);
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
    }
  };

  const startRepeat = (direction: 1 | -1) => {
    stopRepeat();
    nudge(direction);
    timer.current = setInterval(() => nudge(direction), REPEAT_INTERVAL_MS);
  };

  const commitDraft = () => {
    setEditing(false);
    const parsed = Number.parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      const next = clampStep(parsed, min, max);
      if (next !== value) {
        onChange(next);
      }
    }
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment' && canIncrement) {
      nudge(1);
    } else if (event.nativeEvent.actionName === 'decrement' && canDecrement) {
      nudge(-1);
    }
  };

  const shown = formatValue(value);
  const buttonStyle = (enabled: boolean, pressed: boolean) => [
    styles.button,
    {
      borderRadius: theme.radius.md,
      borderWidth: theme.borderWidth.control,
      borderColor: enabled ? theme.color.borderStrong : theme.color.border,
      backgroundColor: enabled && pressed ? theme.color.surfaceSunken : 'transparent',
    },
  ];

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}, ${shown}`}
      accessibilityValue={{ min, max: max === Number.MAX_SAFE_INTEGER ? undefined : max, now: value, text: shown }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.root}
    >
      {hideLabel ? null : (
        <View style={styles.caption} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Text variant="body" tone={disabled ? 'muted' : 'primary'} testID={testID ? `${testID}-label` : undefined}>
            {label}
          </Text>
          {caption ? (
            <Text variant="footnote" tone="secondary">
              {caption}
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.controls}>
        <Pressable
          testID={testID ? `${testID}-decrement` : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityState={{ disabled: !canDecrement }}
          aria-disabled={!canDecrement}
          disabled={!canDecrement}
          onPress={() => nudge(-1)}
          onLongPress={() => startRepeat(-1)}
          delayLongPress={REPEAT_DELAY_MS}
          onPressOut={stopRepeat}
          style={({ pressed }) => buttonStyle(canDecrement, pressed)}
        >
          <Icon name="minus" size={20} color={canDecrement ? 'textPrimary' : 'textMuted'} />
        </Pressable>
        {editing ? (
          <TextInput
            testID={testID ? `${testID}-input` : undefined}
            accessibilityLabel={label}
            autoFocus
            value={draft}
            onChangeText={setDraft}
            keyboardType="number-pad"
            onSubmitEditing={commitDraft}
            onBlur={commitDraft}
            selectTextOnFocus
            style={[
              textStyle('scoreMedium', theme, { size: 24, lineHeight: 28 }),
              styles.value,
              styles.input,
              { borderColor: theme.color.accent, borderWidth: theme.borderWidth.emphasis, borderRadius: theme.radius.md },
            ]}
          />
        ) : (
          <Pressable
            testID={testID ? `${testID}-value` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Type ${label}`}
            disabled={!editable || disabled}
            onPress={() => {
              setDraft(String(value));
              setEditing(true);
            }}
            style={styles.valueTouch}
          >
            <Text variant="scoreMedium" style={[styles.value, { fontSize: 24, lineHeight: 28 }]} align="center">
              {shown}
            </Text>
          </Pressable>
        )}
        <Pressable
          testID={testID ? `${testID}-increment` : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityState={{ disabled: !canIncrement }}
          aria-disabled={!canIncrement}
          disabled={!canIncrement}
          onPress={() => nudge(1)}
          onLongPress={() => startRepeat(1)}
          delayLongPress={REPEAT_DELAY_MS}
          onPressOut={stopRepeat}
          style={({ pressed }) => buttonStyle(canIncrement, pressed)}
        >
          <Icon name="plus" size={20} color={canIncrement ? 'textPrimary' : 'textMuted'} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch', minHeight: 44 },
  caption: { flex: 1, minWidth: 0, gap: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0, marginLeft: 'auto' },
  button: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  valueTouch: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 56, textAlign: 'center' },
  input: { height: 44, paddingVertical: 0 },
});

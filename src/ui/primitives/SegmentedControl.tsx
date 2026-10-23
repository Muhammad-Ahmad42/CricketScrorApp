import { Pressable, StyleSheet } from 'react-native';
import { GlassSurface } from '../glass/GlassSurface';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { Icon } from './Icon';
import { focusRingStyle, useFocusRing } from './internal/interaction';

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly floating?: boolean;
  readonly testID?: string;
}

export const SEGMENT_TRACK_PADDING = 2;

export const SEGMENT_SELECTED_BORDER = 1.5;

interface SegmentButtonProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
}

function SegmentButton({ label, accessibilityLabel, selected, disabled, testID, onPress }: SegmentButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [
        styles.segment,
        { borderRadius: theme.glass.radius.control - SEGMENT_TRACK_PADDING },
        selected
          ? {
              backgroundColor: theme.glass.selection,
              borderWidth: SEGMENT_SELECTED_BORDER,
              borderColor: theme.color.accent,
            }
          : { borderWidth: SEGMENT_SELECTED_BORDER, borderColor: 'transparent' },
        pressed && !selected && !disabled ? { backgroundColor: theme.glass.pressed } : null,
        focusRingStyle(theme, focus.focused, 'inside'),
      ]}
    >
      {selected ? <Icon name="check" size={16} color="accent" /> : null}
      <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={disabled ? 'muted' : selected ? 'primary' : 'secondary'} numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
  floating = false,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <GlassSurface
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      level="control"
      radius={theme.glass.radius.control}
      blur={floating}
      elevated={floating}
      style={[styles.track, { height: theme.size.segmented }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <SegmentButton
            key={option.value}
            label={option.label}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            selected={selected}
            disabled={disabled}
            testID={option.testID}
            onPress={() => {
              if (!selected) {
                onChange(option.value);
              }
            }}
          />
        );
      })}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: SEGMENT_TRACK_PADDING, alignSelf: 'stretch' },
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 44,
    height: 40,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    paddingHorizontal: space.xs,
  },
  label: { flexShrink: 1, letterSpacing: 0 },
});

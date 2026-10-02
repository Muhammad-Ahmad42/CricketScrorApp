import { Pressable, StyleSheet, View } from 'react-native';
import { Text, space, useTheme } from '@/ui';

export interface OptionButtonProps {
  readonly label: string;
  readonly detail?: string | null;
  readonly tag?: string | null;
  readonly trailing?: string | null;
  readonly selected?: boolean;
  readonly highlighted?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly compact?: boolean;
}

export function OptionButton({
  label,
  detail,
  tag,
  trailing,
  selected = false,
  highlighted = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
  compact = false,
}: OptionButtonProps) {
  const theme = useTheme();
  const emphasised = selected || highlighted;
  const parts = [label, tag, detail, trailing].filter((part): part is string => typeof part === 'string' && part.length > 0);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? parts.join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact ? theme.size.buttonMd : theme.size.sheetChoice,
          borderRadius: theme.radius.md,
          borderWidth: emphasised ? theme.borderWidth.emphasis : theme.borderWidth.control,
          borderColor: emphasised ? theme.color.accent : theme.color.borderStrong,
          backgroundColor: pressed ? theme.color.surfaceSunken : selected ? theme.color.accentSubtle : theme.color.surface,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={disabled ? 'muted' : 'primary'} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ? (
        <Text variant="tableNumeric" tone="secondary" numberOfLines={1}>
          {trailing}
        </Text>
      ) : null}
      {tag ? (
        <View style={[styles.tag, { borderColor: theme.color.borderStrong, borderRadius: theme.radius.xs }]}>
          <Text variant="footnote" weight="semibold" tone="secondary">
            {tag}
          </Text>
        </View>
      ) : null}
      {selected ? (
        <Text variant="label" tone="accent">
          Selected
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    minWidth: 44,
  },
  text: { flex: 1, gap: 2 },
  tag: { borderWidth: 1, paddingHorizontal: space.xxs },
});

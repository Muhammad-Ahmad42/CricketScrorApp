import { Pressable, StyleSheet } from 'react-native';
import { Text, space, useTheme } from '@/ui';

export interface ChipButtonProps {
  readonly label: string;
  readonly caption?: string | null;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly wide?: boolean;
  readonly testID?: string;
}

export function ChipButton({ label, caption, accessibilityLabel, onPress, wide = false, testID }: ChipButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        wide ? styles.wide : null,
        {
          minHeight: theme.size.sheetChoice,
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth.control,
          borderColor: theme.color.borderStrong,
          backgroundColor: pressed ? theme.color.accentSubtle : theme.color.surface,
        },
      ]}
    >
      <Text variant="figureSmall" numberOfLines={1}>
        {label}
      </Text>
      {caption ? (
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 96, flexGrow: 1, flexBasis: '30%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
  wide: { flexBasis: '45%' },
});

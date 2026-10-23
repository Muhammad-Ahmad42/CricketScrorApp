import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { focusRingStyle, hitSlopFor, useFocusRing } from '../primitives/internal/interaction';
import { BowlerMarker, StrikerMarker } from '../primitives/Markers';
import { space, useTheme } from '../theme';
import { Text } from '../typography';

export interface StatLineProps {
  readonly kind: 'batter' | 'bowler';
  readonly name: string;
  readonly figure: string;
  readonly secondary?: string | null;
  readonly secondaryLabel?: string | null;
  readonly detail?: string | null;
  readonly active?: boolean;
  readonly compact?: boolean;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string;
  readonly onPress?: () => void;
  readonly testID?: string;
  readonly markerTestID?: string;
}

function StatLineComponent({
  kind,
  name,
  figure,
  secondary,
  secondaryLabel,
  detail,
  active = false,
  compact = false,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
  markerTestID,
}: StatLineProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const highlighted = kind === 'batter' && active;
  const height = compact ? theme.size.statLineCompact : theme.size.statLine;
  const surface = highlighted ? theme.color.accentSubtle : 'transparent';
  const content = (
    <>
      {highlighted ? <View style={[styles.bar, { backgroundColor: theme.color.accent }]} /> : null}
      <View style={styles.marker}>
        {kind === 'bowler' ? <BowlerMarker testID={markerTestID} /> : active ? <StrikerMarker testID={markerTestID} /> : null}
      </View>
      <View style={styles.nameBlock}>
        <Text variant={active ? 'bodyStrong' : 'body'}>{name}</Text>
        {detail ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.figures}>
        <Text variant="figure">{figure}</Text>
        {secondary ? (
          secondaryLabel ? (
            <View style={styles.labelled}>
              <Text variant="label" tone="secondary">
                {secondaryLabel}
              </Text>
              <Text variant="tableNumeric" tone="secondary">
                {secondary}
              </Text>
            </View>
          ) : (
            <Text variant="subhead" tone="secondary" style={styles.secondary}>
              {secondary}
            </Text>
          )
        ) : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="text"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={[styles.row, { minHeight: height, backgroundColor: surface }]}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: highlighted }}
      hitSlop={hitSlopFor(height)}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={({ pressed }) => [
        styles.row,
        { minHeight: height, backgroundColor: pressed ? theme.color.surfaceSunken : surface },
        focusRingStyle(theme, focus.focused, 'inside'),
      ]}
    >
      {content}
    </Pressable>
  );
}

export const StatLine = memo(StatLineComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 44,
    paddingRight: space.md,
    paddingVertical: space.xxs,
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  marker: { width: space.md + space.sm, alignItems: 'center', justifyContent: 'center' },
  nameBlock: { flex: 1, flexShrink: 1, minWidth: 0, paddingRight: space.xs },
  figures: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  labelled: { flexDirection: 'row', alignItems: 'baseline', gap: space.xxs },
  secondary: { fontVariant: ['tabular-nums'] },
});

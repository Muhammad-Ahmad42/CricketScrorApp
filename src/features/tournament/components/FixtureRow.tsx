import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Icon, Separator, Text, space, useTheme, type BadgeTone } from '@/ui';
import type { FixtureRowVM } from '../selectors/fixtures';

export interface FixtureRowProps {
  readonly row: FixtureRowVM;
  readonly onPress?: () => void;
  readonly testIDPrefix?: string;
  readonly trailing?: ReactNode;
  readonly showStatus?: boolean;
}

function statusTone(row: FixtureRowVM): BadgeTone {
  switch (row.status) {
    case 'live':
      return 'live';
    case 'postponed':
    case 'abandoned':
      return 'paused';
    case 'cancelled':
      return 'eliminated';
    case 'completed':
      return 'plain';
    default:
      return 'outline';
  }
}

export function FixtureRow({ row, onPress, testIDPrefix = 'fixtures', trailing, showStatus = true }: FixtureRowProps) {
  const theme = useTheme();
  const label = `${row.label}, ${row.teamsText}, ${row.statusLabel}, ${row.detail}`;
  return (
    <View>
      <View style={[styles.line, { backgroundColor: theme.color.surface }]}>
        <Pressable
          testID={`${testIDPrefix}-row-${row.matchNumber}`}
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityLabel={label}
          disabled={!onPress}
          onPress={onPress}
          style={({ pressed }) => [styles.row, trailing ? styles.rowWithTrailing : null, { backgroundColor: pressed ? theme.color.surfaceSunken : theme.color.surface }]}
        >
          <Text variant="tableNumeric" tone="secondary" style={styles.label} numberOfLines={1}>
            {row.label}
          </Text>
          <View style={styles.main}>
            <Text variant="body" numberOfLines={2} testID={`${testIDPrefix}-text-teams-${row.matchNumber}`}>
              {row.teamsText}
            </Text>
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {row.detail}
            </Text>
          </View>
          {showStatus && row.status !== 'scheduled' ? (
            <Badge label={row.statusLabel} tone={statusTone(row)} testID={`${testIDPrefix}-text-status-${row.matchNumber}`} />
          ) : showStatus ? (
            <Text variant="footnote" tone="muted" testID={`${testIDPrefix}-text-status-${row.matchNumber}`}>
              {row.statusLabel}
            </Text>
          ) : null}
          {onPress && !trailing ? <Icon name="chevron-right" size={20} color="textMuted" /> : null}
        </Pressable>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      <Separator inset={space.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  rowWithTrailing: { paddingRight: space.sm },
  trailing: { paddingRight: space.md },
  label: { width: 44 },
  main: { flex: 1, gap: 2 },
});

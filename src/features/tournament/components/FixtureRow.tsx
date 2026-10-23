import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, PressableRow, Separator, Text, space, useContentSurface, useGutter, type BadgeTone } from '@/ui';
import type { FixtureRowVM } from '../selectors/fixtures';
import { Scoreline } from './Scoreline';

export interface FixtureRowProps {
  readonly row: FixtureRowVM;
  readonly onPress?: () => void;
  readonly testIDPrefix?: string;
  readonly trailing?: ReactNode;
  readonly showStatus?: boolean;
}

export function fixtureStatusTone(status: FixtureRowVM['status']): BadgeTone {
  switch (status) {
    case 'live':
      return 'live';
    case 'postponed':
    case 'abandoned':
      return 'paused';
    case 'cancelled':
      return 'eliminated';
    case 'completed':
    case 'rescheduled':
      return 'outline';
    default:
      return 'plain';
  }
}

export function FixtureRow({ row, onPress, testIDPrefix = 'fixtures', trailing, showStatus = true }: FixtureRowProps) {
  const surface = useContentSurface();
  const gutter = useGutter();
  const spokenScore = row.scoreline ? `, ${row.scoreline.spoken}` : '';
  const label = `${row.label}, ${row.teamsText}, ${row.statusLabel}, ${row.detail}${spokenScore}`;
  return (
    <View>
      <View style={[styles.line, { backgroundColor: surface }]}>
        <View style={styles.flex}>
          <PressableRow
            testID={`${testIDPrefix}-row-${row.matchNumber}`}
            accessibilityLabel={label}
            onPress={onPress}
            chevron={trailing === undefined}
            separator={false}
            align="start"
          >
            <Text variant="tableNumeric" tone="secondary" style={styles.label}>
              {row.label}
            </Text>
            <View style={styles.main}>
              <Text variant="body" weight="medium" testID={`${testIDPrefix}-text-teams-${row.matchNumber}`}>
                {row.teamsText}
              </Text>
              <View style={styles.meta}>
                {showStatus ? <Badge label={row.statusLabel} tone={fixtureStatusTone(row.status)} testID={`${testIDPrefix}-text-status-${row.matchNumber}`} /> : null}
                <Text variant="footnote" tone="secondary" style={styles.metaText}>
                  {row.meta}
                </Text>
              </View>
              {row.note ? (
                <Text variant="footnote" tone={row.result ? 'primary' : 'secondary'} testID={`${testIDPrefix}-text-note-${row.matchNumber}`}>
                  {row.note}
                </Text>
              ) : null}
              {row.scoreline ? <Scoreline scoreline={row.scoreline} testID={`${testIDPrefix}-text-score-${row.matchNumber}`} /> : null}
            </View>
          </PressableRow>
        </View>
        {trailing ? <View style={[styles.trailing, { paddingRight: gutter }]}>{trailing}</View> : null}
      </View>
      <Separator inset={gutter} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, minWidth: 0 },
  trailing: { justifyContent: 'center' },
  label: { minWidth: space['3xl'] },
  main: { flex: 1, minWidth: 0, gap: space.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  metaText: { flexShrink: 1 },
});

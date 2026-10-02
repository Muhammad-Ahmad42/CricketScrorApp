import { StyleSheet, View } from 'react-native';
import { COLUMN_WIDTH, EmptyState, ManhattanChart, PartnershipBars, Screen, SectionHeader, Table, WormChart, space, type TableColumn } from '@/ui';
import { useLiveMatchStore } from '@/stores';
import { TopBar } from '@/features/scoring/components/common/TopBar';
import { leaveMatch, MatchGate } from '@/features/scoring/screens/MatchGate';
import { selectAnalytics, type SummaryRowVM } from '../selectors/analytics';

function summaryColumns(teams: readonly string[]): readonly TableColumn<SummaryRowVM>[] {
  return [
    { key: 'metric', header: 'Scoring', kind: 'name', value: (row) => row.metric },
    ...teams.map((team, index) => ({
      key: `team-${index}`,
      header: team,
      kind: 'numeric' as const,
      width: COLUMN_WIDTH.name - COLUMN_WIDTH.digits3,
      value: (row: SummaryRowVM) => row.values[index] ?? '–',
    })),
  ];
}

function AnalyticsBody() {
  const live = useLiveMatchStore((s) => s.live);
  if (live === null) {
    return null;
  }
  const vm = selectAnalytics(live);
  return (
    <Screen testID="screen-analytics" header={<TopBar title="Analytics" onBack={leaveMatch} />}>
      {vm.hasData ? (
        <View style={styles.charts}>
          <WormChart series={vm.worm} accessibilityLabel={vm.wormLabel} title="Runs by over (worm)" testID="analytics-worm" />
          <ManhattanChart innings={vm.manhattan} accessibilityLabel={vm.manhattanLabel} title="Runs per over (Manhattan)" testID="analytics-manhattan" />
          {vm.partnerships.map((entry) => (
            <PartnershipBars
              key={entry.key}
              rows={entry.rows}
              title={entry.title}
              accessibilityLabel={`${entry.title}: ${entry.rows.map((row) => row.accessibilityLabel).join('. ')}`}
              testID={`analytics-partnerships-${entry.key}`}
            />
          ))}
          <View>
            <SectionHeader title="Scoring" />
            <Table
              columns={summaryColumns(vm.teams)}
              rows={vm.summary}
              rowKey={(row) => row.key}
              rowAccessibilityLabel={(row) => `${row.metric}: ${vm.teams.map((team, index) => `${team} ${row.values[index] ?? 'none'}`).join(', ')}`}
              testID="analytics-summary"
            />
          </View>
        </View>
      ) : (
        <EmptyState title="No overs yet" body="Charts appear once the first ball is bowled." icon="history" testID="analytics-empty" />
      )}
    </Screen>
  );
}

export function AnalyticsScreen() {
  return (
    <MatchGate title="Analytics">
      <AnalyticsBody />
    </MatchGate>
  );
}

const styles = StyleSheet.create({
  charts: { gap: space.md },
});

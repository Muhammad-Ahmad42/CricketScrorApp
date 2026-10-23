import { StyleSheet, View } from 'react-native';
import { Table, type TableColumn } from '../primitives/Table';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { ChartFrame } from './ChartFrame';
import type { PartnershipBarItem } from './chartData';
import { SERIES_TOKENS } from './chartTheme';

export interface PartnershipBarsProps {
  readonly rows: readonly PartnershipBarItem[];
  readonly accessibilityLabel: string;
  readonly title?: string;
  readonly series?: number;
  readonly testID?: string;
}

export function barFraction(runs: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, runs / max));
}

const COLUMNS: readonly TableColumn<PartnershipBarItem>[] = [
  { key: 'wicket', header: 'Wkt', kind: 'name', width: 56, value: (row) => row.wicketLabel, subtext: (row) => row.batters },
  { key: 'runs', header: 'R', kind: 'numeric', width: 40, value: (row) => String(row.runs) },
  { key: 'balls', header: 'B', kind: 'numeric', width: 40, value: (row) => String(row.balls) },
];

export function seriesToken(series: number): (typeof SERIES_TOKENS)[number] {
  const index = Math.max(0, Math.min(SERIES_TOKENS.length - 1, Math.floor(series)));
  return SERIES_TOKENS[index] ?? SERIES_TOKENS[0];
}

export function PartnershipBars({ rows, accessibilityLabel, title = 'Partnerships', series = 0, testID }: PartnershipBarsProps) {
  const theme = useTheme();
  const barColor = theme.color[seriesToken(series)];
  const max = rows.reduce((m, row) => Math.max(m, row.runs), 0);
  const chart = (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.key} accessible accessibilityLabel={row.accessibilityLabel} style={styles.row}>
          <View style={styles.labels}>
            <Text variant="footnote" tone="secondary" numberOfLines={1} style={styles.batters}>
              {`${row.wicketLabel} · ${row.batters}`}
            </Text>
            <Text variant="tableNumeric">{`${row.runs} (${row.balls})`}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.color.chartGrid, borderRadius: theme.radius.xs }]}>
            <View
              style={[
                styles.bar,
                {
                  width: `${barFraction(row.runs, max) * 100}%`,
                  backgroundColor: barColor,
                  borderRadius: theme.radius.xs,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
  return (
    <ChartFrame
      testID={testID}
      title={title}
      accessibilityLabel={accessibilityLabel}
      chart={chart}
      table={
        <Table
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.key}
          rowAccessibilityLabel={(row) => row.accessibilityLabel}
          emptyText="No partnerships yet"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { gap: space.xxs },
  labels: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.xs },
  batters: { flex: 1 },
  track: { height: 8, overflow: 'hidden' },
  bar: { height: 8 },
});

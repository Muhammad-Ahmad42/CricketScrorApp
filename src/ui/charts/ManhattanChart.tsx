import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Table, type TableColumn } from '../primitives/Table';
import { space, useTheme, type Theme } from '../theme';
import { Text, textStyle } from '../typography';
import { ChartFrame } from './ChartFrame';
import { axisLabelEvery, manhattanMax, MAX_SERIES, niceMax, runsAndWicketsText, wicketMarkText, type ManhattanInnings, type ManhattanOver } from './chartData';
import { SERIES_TOKENS } from './chartTheme';

const Y_AXIS_WIDTH = 32;
const SECTIONS = 3;
const BAR_GAP = 2;

export interface ManhattanChartProps {
  readonly innings: readonly ManhattanInnings[];
  readonly accessibilityLabel: string;
  readonly title?: string;
  readonly height?: number;
  readonly testID?: string;
}

function WicketMark({ wickets }: { readonly wickets: number }) {
  return (
    <Text variant="label" style={styles.wicketMark}>
      {wicketMarkText(wickets)}
    </Text>
  );
}

function bars(theme: Theme, overs: readonly ManhattanOver[], seriesIndex: number, every: number) {
  const color = theme.color[SERIES_TOKENS[seriesIndex]];
  return overs.map((over) => ({
    value: over.runs,
    label: over.over % every === 0 ? String(over.over) : '',
    frontColor: color,
    topLabelComponent: over.wickets > 0 ? () => <WicketMark wickets={over.wickets} /> : undefined,
  }));
}

interface ManhattanRow {
  readonly over: number;
  readonly byInnings: readonly (ManhattanOver | null)[];
}

function manhattanRows(innings: readonly ManhattanInnings[]): readonly ManhattanRow[] {
  const overs = innings.reduce((max, i) => i.overs.reduce((m, o) => Math.max(m, o.over), max), 0);
  return Array.from({ length: overs }, (_, index) => {
    const over = index + 1;
    return { over, byInnings: innings.map((i) => i.overs.find((o) => o.over === over) ?? null) };
  });
}

function manhattanColumns(innings: readonly ManhattanInnings[]): readonly TableColumn<ManhattanRow>[] {
  const columns: TableColumn<ManhattanRow>[] = [{ key: 'over', header: 'Over', kind: 'name', width: 56, value: (row) => String(row.over) }];
  innings.forEach((i, index) => {
    columns.push({ key: `r-${index}`, header: `${i.label} R`, kind: 'numeric', width: 64, value: (row) => (row.byInnings[index] ? String(row.byInnings[index]?.runs) : '–') });
    columns.push({ key: `w-${index}`, header: 'W', kind: 'numeric', width: 32, value: (row) => (row.byInnings[index] ? String(row.byInnings[index]?.wickets) : '–') });
  });
  return columns;
}

export function ManhattanChart({ innings, accessibilityLabel, title = 'Runs per over', height = 120, testID }: ManhattanChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const shown = innings.slice(0, MAX_SERIES);
  const maxValue = niceMax(manhattanMax(shown), SECTIONS);
  const axisText = textStyle('footnote', theme, { tone: 'secondary' });
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH - space.md);

  const chart = (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} style={styles.multiples}>
      {shown.map((inn, index) => {
        const overs = Math.max(1, inn.overs.length);
        const barWidth = Math.max(2, plotWidth / overs - BAR_GAP);
        return (
          <View key={inn.label} style={styles.multiple}>
            <Text variant="label" tone="secondary">
              {inn.label}
            </Text>
            {width > 0 ? (
              <BarChart
                data={bars(theme, inn.overs, index, axisLabelEvery(overs))}
                barWidth={barWidth}
                spacing={BAR_GAP}
                initialSpacing={0}
                endSpacing={0}
                height={height}
                width={plotWidth}
                maxValue={maxValue}
                noOfSections={SECTIONS}
                yAxisLabelWidth={Y_AXIS_WIDTH}
                barBorderTopLeftRadius={4}
                barBorderTopRightRadius={4}
                rulesColor={theme.color.chartGrid}
                rulesType="solid"
                xAxisColor={theme.color.border}
                yAxisColor={theme.color.border}
                yAxisThickness={0}
                xAxisThickness={1}
                yAxisTextStyle={axisText}
                xAxisLabelTextStyle={axisText}
                backgroundColor={theme.color.surface}
                disableScroll
                disablePress
                isAnimated={false}
              />
            ) : (
              <View style={{ height }} />
            )}
          </View>
        );
      })}
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
          columns={manhattanColumns(shown)}
          rows={manhattanRows(shown)}
          rowKey={(row) => String(row.over)}
          rowAccessibilityLabel={(row) =>
            [`Over ${row.over}`, ...shown.map((inn, index) => {
              const over = row.byInnings[index];
              return over ? `${inn.label} ${runsAndWicketsText(over.runs, over.wickets)}` : `${inn.label}, no score`;
            })].join('. ')
          }
          emptyText="No overs bowled yet"
          scrollable
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  multiples: { gap: space.md },
  multiple: { gap: space.xs },
  wicketMark: { textTransform: 'none', textAlign: 'center' },
});

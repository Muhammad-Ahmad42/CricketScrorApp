import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Table, type TableColumn } from '../primitives/Table';
import { useTheme, type Theme } from '../theme';
import { Text, textStyle } from '../typography';
import { ChartFrame, type LegendItem } from './ChartFrame';
import { SERIES_DASH_PATTERN, SERIES_TOKENS } from './chartTheme';
import { axisLabelEvery, MAX_SERIES, niceMax, runsAndWicketsText, wicketMarkText, wormMax, wormOvers, wormTableRows, type WormSeries, type WormTableRow } from './chartData';

const Y_AXIS_WIDTH = 32;
const SECTIONS = 4;
export const WORM_EDGE_SPACING = 12;
export const WICKET_DOT = 10;
const WICKET_LABEL_WIDTH = 16;
const WICKET_LABEL_SHIFT = -22;

export function wormSpacing(plotWidth: number, overs: number): number {
  const usable = Math.max(0, plotWidth - WORM_EDGE_SPACING * 2);
  return overs > 0 ? usable / overs : usable;
}

function WicketDot({ fill, ring }: { readonly fill: string; readonly ring: string }) {
  return <View style={[styles.dot, { backgroundColor: fill, borderColor: ring }]} />;
}

function WicketLabel({ wickets }: { readonly wickets: number }) {
  return (
    <View style={[styles.wicketLabel, { width: wicketLabelWidth(wickets) }]}>
      <Text variant="label" style={styles.wicketText}>
        {wicketMarkText(wickets)}
      </Text>
    </View>
  );
}

function wicketLabelWidth(wickets: number): number {
  return wickets > 1 ? WICKET_LABEL_WIDTH + 10 : WICKET_LABEL_WIDTH;
}

export interface WormChartProps {
  readonly series: readonly WormSeries[];
  readonly accessibilityLabel: string;
  readonly title?: string;
  readonly height?: number;
  readonly testID?: string;
}

function lineData(theme: Theme, series: WormSeries | undefined, every: number) {
  if (!series) {
    return undefined;
  }
  const origin = { value: 0, label: '0', hideDataPoint: true };
  const fill = theme.color.textPrimary;
  const ring = theme.color.surface;
  return [
    origin,
    ...series.points.map((point) => {
      const wicket = point.wickets > 0;
      return {
        value: point.runs,
        label: point.over % every === 0 ? String(point.over) : '',
        hideDataPoint: !wicket,
        dataPointWidth: WICKET_DOT,
        dataPointHeight: WICKET_DOT,
        customDataPoint: wicket ? () => <WicketDot fill={fill} ring={ring} /> : undefined,
        dataPointLabelComponent: wicket ? () => <WicketLabel wickets={point.wickets} /> : undefined,
        dataPointLabelWidth: wicketLabelWidth(point.wickets),
        dataPointLabelShiftY: WICKET_LABEL_SHIFT,
      };
    }),
  ];
}

function wormColumns(series: readonly WormSeries[]): readonly TableColumn<WormTableRow>[] {
  const columns: TableColumn<WormTableRow>[] = [
    { key: 'over', header: 'Over', kind: 'name', width: 56, value: (row) => String(row.over) },
  ];
  series.forEach((s, index) => {
    columns.push({
      key: `runs-${index}`,
      header: `${s.label} R`,
      kind: 'numeric',
      width: 64,
      value: (row) => (row.cells[index] ? String(row.cells[index]?.runs) : '–'),
    });
    columns.push({
      key: `wkts-${index}`,
      header: 'W',
      kind: 'numeric',
      width: 32,
      value: (row) => (row.cells[index] ? String(row.cells[index]?.wickets) : '–'),
    });
  });
  return columns;
}

export function WormChart({ series, accessibilityLabel, title = 'Worm', height = 200, testID }: WormChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const shown = series.slice(0, MAX_SERIES);
  const overs = Math.max(1, wormOvers(shown));
  const every = axisLabelEvery(overs);
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH - 16);
  const spacing = wormSpacing(plotWidth, overs);
  const axisText = textStyle('footnote', theme, { tone: 'secondary' });
  const legend: LegendItem[] = shown.map((s, index) => ({ label: s.label, color: SERIES_TOKENS[index], dashed: index === 1 }));
  const rows = wormTableRows(shown);

  const chart = (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <LineChart
          data={lineData(theme, shown[0], every)}
          data2={lineData(theme, shown[1], every)}
          color1={theme.color.chartSeries1}
          color2={theme.color.chartSeries2}
          thickness1={2}
          thickness2={2}
          strokeDashArray2={[...SERIES_DASH_PATTERN]}
          height={height}
          width={plotWidth}
          spacing={spacing}
          initialSpacing={WORM_EDGE_SPACING}
          endSpacing={WORM_EDGE_SPACING}
          maxValue={niceMax(wormMax(shown), SECTIONS)}
          noOfSections={SECTIONS}
          yAxisLabelWidth={Y_AXIS_WIDTH}
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
          isAnimated={false}
        />
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );

  return (
    <ChartFrame
      testID={testID}
      title={title}
      accessibilityLabel={accessibilityLabel}
      legend={legend}
      chart={chart}
      table={
        <Table
          columns={wormColumns(shown)}
          rows={rows}
          rowKey={(row) => String(row.over)}
          rowAccessibilityLabel={(row) =>
            [`Over ${row.over}`, ...shown.map((s, index) => {
              const cell = row.cells[index];
              return cell ? `${s.label} ${runsAndWicketsText(cell.runs, cell.wickets)}` : `${s.label}, no score`;
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
  dot: { width: WICKET_DOT, height: WICKET_DOT, borderRadius: WICKET_DOT, borderWidth: 2 },
  wicketLabel: { width: WICKET_LABEL_WIDTH, alignItems: 'center' },
  wicketText: { textTransform: 'none', letterSpacing: 0 },
});

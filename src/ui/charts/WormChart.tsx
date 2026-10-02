import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Table, type TableColumn } from '../primitives/Table';
import { useTheme, type Theme } from '../theme';
import { textStyle } from '../typography';
import { ChartFrame, type LegendItem } from './ChartFrame';
import { SERIES_DASH_PATTERN, SERIES_TOKENS } from './chartTheme';
import { axisLabelEvery, MAX_SERIES, niceMax, wormMax, wormOvers, wormTableRows, type WormSeries, type WormTableRow } from './chartData';

const Y_AXIS_WIDTH = 32;
const SECTIONS = 4;

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
  return [
    origin,
    ...series.points.map((point) => ({
      value: point.runs,
      label: point.over % every === 0 ? String(point.over) : '',
      hideDataPoint: point.wickets === 0,
      dataPointColor: theme.color.textPrimary,
      dataPointRadius: 4,
      dataPointText: point.wickets > 0 ? 'W' : undefined,
      textColor: theme.color.textSecondary,
      textFontSize: 12,
      textShiftY: -6,
    })),
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
  const spacing = overs > 0 ? plotWidth / overs : plotWidth;
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
          initialSpacing={0}
          endSpacing={0}
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
              return cell ? `${s.label} ${cell.runs} runs, ${cell.wickets} wickets` : `${s.label}, no score`;
            })].join('. ')
          }
          emptyText="No overs bowled yet"
          scrollable
        />
      }
    />
  );
}

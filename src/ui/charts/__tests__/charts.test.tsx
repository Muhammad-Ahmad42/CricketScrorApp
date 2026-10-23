import '../../testing';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { darkColors, lightColors, parseColor } from '../../theme';
import {
  ManhattanChart,
  PartnershipBars,
  WORM_EDGE_SPACING,
  WormChart,
  axisLabelEvery,
  barFraction,
  niceMax,
  seriesToken,
  wormSpacing,
  wormTableRows,
  type ManhattanInnings,
  type PartnershipBarItem,
  type WormSeries,
  wicketMarkText,
  runsAndWicketsText,
} from '..';

const lineChart = jest.mocked(LineChart);
const barChart = jest.mocked(BarChart);

const WORM: readonly WormSeries[] = [
  {
    label: 'TIG',
    points: [
      { over: 1, runs: 8, wickets: 0 },
      { over: 2, runs: 15, wickets: 1 },
      { over: 3, runs: 27, wickets: 0 },
    ],
  },
  {
    label: 'LIO',
    points: [
      { over: 1, runs: 4, wickets: 0 },
      { over: 2, runs: 19, wickets: 0 },
    ],
  },
];

const MANHATTAN: readonly ManhattanInnings[] = [
  { label: 'TIG', overs: [{ over: 1, runs: 8, wickets: 0 }, { over: 2, runs: 7, wickets: 1 }] },
  { label: 'LIO', overs: [{ over: 1, runs: 4, wickets: 0 }, { over: 2, runs: 15, wickets: 0 }] },
];

const PARTNERSHIPS: readonly PartnershipBarItem[] = [
  { key: 'p1', wicketLabel: '1st', batters: 'Ali and Ahmed', runs: 42, balls: 31, accessibilityLabel: '1st wicket, Ali and Ahmed, 42 runs from 31 balls' },
  { key: 'p2', wicketLabel: '2nd', batters: 'Babar and Rizwan', runs: 21, balls: 20, accessibilityLabel: '2nd wicket, Babar and Rizwan, 21 runs from 20 balls' },
];

async function layout(testID: string) {
  const chart = screen.getByLabelText(new RegExp(testID));
  await fireEvent(chart.children[0] as never, 'layout', { nativeEvent: { layout: { width: 358, height: 200, x: 0, y: 0 } } });
}

beforeEach(() => {
  lineChart.mockClear();
  barChart.mockClear();
});

describe('chart data helpers', () => {
  it('rounds the axis maximum up to a readable step', () => {
    expect(niceMax(27, 4)).toBe(40);
    expect(niceMax(21, 3)).toBe(30);
    expect(niceMax(168, 4)).toBe(200);
    expect(niceMax(0, 4)).toBe(4);
    expect(axisLabelEvery(6)).toBe(1);
    expect(axisLabelEvery(20)).toBe(5);
    expect(axisLabelEvery(50)).toBe(10);
  });

  it('builds the table view with cumulative wickets per side', () => {
    expect(wormTableRows(WORM)).toEqual([
      { over: 1, cells: [{ runs: 8, wickets: 0 }, { runs: 4, wickets: 0 }] },
      { over: 2, cells: [{ runs: 15, wickets: 1 }, { runs: 19, wickets: 0 }] },
      { over: 3, cells: [{ runs: 27, wickets: 1 }, null] },
    ]);
    expect(barFraction(21, 42)).toBe(0.5);
    expect(barFraction(5, 0)).toBe(0);
  });
});

describe('WormChart', () => {
  it('plots two series with the chart tokens, the second one dashed, on one runs axis', async () => {
    await renderWithTheme(<WormChart series={WORM} accessibilityLabel="Worm chart. Tigers 27 for 1, Lions 19 for 0." testID="worm" />);
    await layout('Worm chart');
    const props = lineChart.mock.calls[lineChart.mock.calls.length - 1][0];
    expect(props.color1).toBe(lightColors.chartSeries1);
    expect(props.color2).toBe(lightColors.chartSeries2);
    expect(props.strokeDashArray2).toEqual([6, 4]);
    expect(props.strokeDashArray1).toBeUndefined();
    expect(props.thickness1).toBe(2);
    expect(props.rulesColor).toBe(lightColors.chartGrid);
    expect(props.backgroundColor).toBe(lightColors.surface);
    expect(props.maxValue).toBe(40);
    expect(props.data?.[2]).toMatchObject({ value: 15, hideDataPoint: false });
    expect(props.data?.[2]?.dataPointText).toBeUndefined();
    expect(typeof props.data?.[2]?.customDataPoint).toBe('function');
    expect(typeof props.data?.[2]?.dataPointLabelComponent).toBe('function');
    expect(props.data?.[1]).toMatchObject({ value: 8, hideDataPoint: true });
    expect(props.data?.[1]?.customDataPoint).toBeUndefined();
    expect(props.initialSpacing).toBe(WORM_EDGE_SPACING);
    expect(props.endSpacing).toBe(WORM_EDGE_SPACING);
  });

  it('draws wicket marks as app views in the app typeface, never SVG text, and keeps the first axis label inside the plot (#14)', async () => {
    await renderWithTheme(<WormChart series={WORM} accessibilityLabel="Worm chart marks" testID="worm" />);
    await layout('Worm chart marks');
    const props = lineChart.mock.calls[lineChart.mock.calls.length - 1][0];
    const point = props.data?.[2];
    await renderWithTheme(<>{point?.dataPointLabelComponent?.(point, 2)}</>);
    const mark = screen.getByText('W');
    expect(mark).toHaveStyle({ fontFamily: expect.stringMatching(/^Inter/) });
    expect(props.data?.some((item) => 'onPress' in (item as object))).toBe(false);
    expect(props.onPress).toBeUndefined();
    expect(props.focusEnabled).toBeFalsy();
    expect(wormSpacing(300, 3)).toBe((300 - WORM_EDGE_SPACING * 2) / 3);
    expect(wormSpacing(0, 3)).toBe(0);
  });

  it('counts wickets on a mark when an over has more than one', async () => {
    expect([wicketMarkText(1), wicketMarkText(2), wicketMarkText(3)]).toEqual(['W', '2W', '3W']);
    await renderWithTheme(<ManhattanChart innings={[{ label: 'LIO', overs: [{ over: 1, runs: 4, wickets: 2 }] }]} accessibilityLabel="Manhattan double" />);
    await layout('Manhattan double');
    const props = barChart.mock.calls[barChart.mock.calls.length - 1][0];
    await renderWithTheme(<>{props.data?.[0]?.topLabelComponent?.()}</>);
    expect(screen.getByText('2W')).toBeOnTheScreen();
  });

  it('uses the dark series steps in the dark theme', async () => {
    await renderWithTheme(<WormChart series={WORM} accessibilityLabel="Worm chart dark" />, { mode: 'dark' });
    await layout('Worm chart dark');
    const props = lineChart.mock.calls[lineChart.mock.calls.length - 1][0];
    expect(props.color1).toBe(darkColors.chartSeries1);
    expect(props.color2).toBe(darkColors.chartSeries2);
  });

  it('exposes a summary label, a legend and a table view toggle', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<WormChart series={WORM} accessibilityLabel="Worm chart. Tigers ahead throughout." testID="worm" />);
    expect(screen.getByRole('image', { name: 'Worm chart. Tigers ahead throughout.' })).toBeOnTheScreen();
    expect(screen.getByText('TIG', { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByLabelText('Over 2. TIG 15 runs, 1 wicket. LIO 19 runs, 0 wickets')).toBeOnTheScreen();
    expect(screen.getByLabelText('Over 3. TIG 27 runs, 1 wicket. LIO, no score')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Show as chart' }));
    expect(screen.getByRole('image')).toBeOnTheScreen();
  });

  it('never plots more than two series', async () => {
    await renderWithTheme(<WormChart series={[...WORM, { label: 'X', points: [{ over: 1, runs: 99, wickets: 0 }] }]} accessibilityLabel="Worm chart capped" />);
    await layout('Worm chart capped');
    const props = lineChart.mock.calls[lineChart.mock.calls.length - 1][0];
    expect(props.maxValue).toBe(40);
  });
});

describe('ManhattanChart', () => {
  it('draws one small multiple per innings on the same scale with wicket marks', async () => {
    await renderWithTheme(<ManhattanChart innings={MANHATTAN} accessibilityLabel="Runs per over chart" />);
    await layout('Runs per over chart');
    const calls = barChart.mock.calls.slice(-2).map((call) => call[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0].maxValue).toBe(calls[1].maxValue);
    expect(calls[0].data?.[0].frontColor).toBe(lightColors.chartSeries1);
    expect(calls[1].data?.[0].frontColor).toBe(lightColors.chartSeries2);
    expect(calls[0].data?.[1].topLabelComponent).toBeDefined();
    expect(calls[0].data?.[0].topLabelComponent).toBeUndefined();
    expect(calls[0].barBorderTopLeftRadius).toBe(4);
    expect(calls[0].spacing).toBe(2);
    expect(screen.getByText('TIG', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('offers the same numbers as a table', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<ManhattanChart innings={MANHATTAN} accessibilityLabel="Runs per over chart" />);
    await user.press(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByLabelText('Over 2. TIG 7 runs, 1 wicket. LIO 15 runs, 0 wickets')).toBeOnTheScreen();
  });

  it('says 1 run and 1 wicket in the table row labels', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<ManhattanChart innings={[{ label: 'LIO', overs: [{ over: 1, runs: 1, wickets: 1 }] }]} accessibilityLabel="Manhattan singular" />);
    await user.press(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.getByLabelText('Over 1. LIO 1 run, 1 wicket')).toBeOnTheScreen();
    expect(runsAndWicketsText(1, 1)).toBe('1 run, 1 wicket');
    expect(runsAndWicketsText(0, 2)).toBe('0 runs, 2 wickets');
  });
});

describe('PartnershipBars', () => {
  it('draws proportional bars with text values and row labels', async () => {
    await renderWithTheme(<PartnershipBars rows={PARTNERSHIPS} accessibilityLabel="Partnerships chart" />);
    expect(screen.getByLabelText('1st wicket, Ali and Ahmed, 42 runs from 31 balls')).toBeOnTheScreen();
    const view = screen.getByLabelText('2nd wicket, Babar and Rizwan, 21 runs from 20 balls');
    const bar = view.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('"width":"50%"'));
    expect(bar).toHaveLength(1);
    expect(bar[0]).toHaveStyle({ backgroundColor: lightColors.chartSeries1 });
  });

  it('draws the second side in the same series colour it has in the worm and Manhattan', async () => {
    await renderWithTheme(<PartnershipBars rows={PARTNERSHIPS} series={1} accessibilityLabel="Second innings partnerships" />);
    const view = screen.getByLabelText('2nd wicket, Babar and Rizwan, 21 runs from 20 balls');
    const bar = view.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('"width":"50%"'));
    expect(bar[0]).toHaveStyle({ backgroundColor: lightColors.chartSeries2 });
    expect(seriesToken(7)).toBe('chartSeries2');
    expect(seriesToken(-1)).toBe('chartSeries1');
  });

  it('never paints a team series in the success green (§107)', () => {
    for (const color of [lightColors, darkColors]) {
      const series2 = parseColor(color.chartSeries2);
      expect(series2.b).toBeGreaterThan(series2.g);
      expect(color.chartSeries2).not.toBe(color.success);
    }
  });
});

import '../../testing';
import { screen, userEvent } from '@testing-library/react-native';
import { scoringKeyHeight } from '../../layout';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { GlassDock } from '../../glass';
import { darkColors, lightColors } from '../../theme';
import { EXTRAS_HINT, ScoreKey, ScoringPad, WICKET_HINT, runKeySpec } from '..';

const KEY_ORDER = ['score-btn-0', 'score-btn-1', 'score-btn-2', 'score-btn-3', 'score-btn-4', 'score-btn-6', 'score-btn-extras', 'score-btn-wicket'];

function renderPad(overrides: Partial<React.ComponentProps<typeof ScoringPad>> = {}) {
  const onRuns = jest.fn();
  const onExtras = jest.fn();
  const onWicket = jest.fn();
  const result = renderWithTheme(<ScoringPad onRuns={onRuns} onExtras={onExtras} onWicket={onWicket} {...overrides} />);
  return { onRuns, onExtras, onWicket, result };
}

describe('ScoringPad', () => {
  it('lays out 0 1 2 3 on the first row and 4 6 EXTRAS WICKET on the second', async () => {
    await renderPad().result;
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.props.testID)).toEqual(KEY_ORDER);
  });

  it('records each run with exactly one tap', async () => {
    const user = userEvent.setup();
    const pad = renderPad();
    await pad.result;
    for (const runs of [0, 1, 2, 3, 4, 6] as const) {
      await user.press(screen.getByTestId(`score-btn-${runs}`));
    }
    expect(pad.onRuns.mock.calls.map((call) => call[0])).toEqual([0, 1, 2, 3, 4, 6]);
    await user.press(screen.getByTestId('score-btn-extras'));
    await user.press(screen.getByTestId('score-btn-wicket'));
    expect(pad.onExtras).toHaveBeenCalledTimes(1);
    expect(pad.onWicket).toHaveBeenCalledTimes(1);
  });

  it('labels every key for screen readers with hints on the sheet keys', async () => {
    await renderPad().result;
    for (const name of ['Zero runs', 'One run', 'Two runs', 'Three runs', 'Four runs, boundary', 'Six runs, boundary', 'Extras', 'Wicket']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Wicket' })).toHaveProp('accessibilityHint', WICKET_HINT);
    expect(screen.getByRole('button', { name: 'Extras' })).toHaveProp('accessibilityHint', EXTRAS_HINT);
  });

  it('shows the dot style chosen in settings', async () => {
    await renderPad({ dotStyle: 'dot' }).result;
    expect(screen.getByRole('button', { name: 'Dot ball' })).toHaveTextContent('•');
    expect(runKeySpec(0, 'zero')).toMatchObject({ label: '0', accessibilityLabel: 'Zero runs' });
  });

  it('adds FOUR and SIX captions as a non-colour cue', async () => {
    await renderPad().result;
    expect(screen.getByTestId('score-btn-4')).toHaveTextContent('4FOUR');
    expect(screen.getByTestId('score-btn-6')).toHaveTextContent('6SIX');
    expect(screen.getByTestId('score-btn-3')).toHaveTextContent('3');
  });

  it('draws WICKET with a 2 px danger border and label, and uses large targets', async () => {
    await renderPad({ keyHeight: 72 }).result;
    const wicket = screen.getByTestId('score-btn-wicket');
    expect(wicket).toHaveStyle({ borderWidth: 2, borderColor: lightColors.danger, height: 72 });
    expect(screen.getByText('WICKET')).toHaveStyle({ color: lightColors.danger });
    for (const id of KEY_ORDER) {
      const size = touchTargetSize(screen.getByTestId(id));
      expect(size.height).toBeGreaterThanOrEqual(56);
      expect(size.width).toBeGreaterThanOrEqual(56);
    }
    expect(screen.getByTestId('score-btn-1')).toHaveStyle({ backgroundColor: lightColors.surface, borderColor: lightColors.borderStrong, borderWidth: 1 });
  });

  it('never makes a key shorter than 56', async () => {
    await renderWithTheme(<ScoreKey kind="runs" label="1" accessibilityLabel="One run" onPress={jest.fn()} height={40} testID="k" />);
    expect(screen.getByTestId('k')).toHaveStyle({ height: 56 });
  });

  it('picks key heights from the window: 72 standard, 64 short, 56 minimum, 80 tablet', () => {
    expect(scoringKeyHeight(390, 844)).toBe(72);
    expect(scoringKeyHeight(360, 640)).toBe(64);
    expect(scoringKeyHeight(320, 568)).toBe(56);
    expect(scoringKeyHeight(330, 700)).toBe(56);
    expect(scoringKeyHeight(820, 1180, true)).toBe(80);
  });

  it('pads the well into the bottom safe area', async () => {
    const view = await renderPad().result;
    const well = view.container.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes(lightColors.surfaceSunken))[0];
    expect(well).toHaveStyle({ paddingBottom: 12 + 34, backgroundColor: lightColors.surfaceSunken });
  });

  it('drops the well inside a glass dock while every key keeps its solid high-contrast face (§106)', async () => {
    const view = await renderWithTheme(
      <GlassDock testID="dock">
        <ScoringPad onRuns={jest.fn()} onExtras={jest.fn()} onWicket={jest.fn()} well={false} bottomInset={false} />
      </GlassDock>,
      { mode: 'dark' },
    );
    expect(view.container.queryAll((node) => JSON.stringify(node.props.style ?? '').includes(darkColors.surfaceSunken))).toHaveLength(0);
    expect(screen.getByTestId('dock')).toHaveStyle({ paddingBottom: 34 });
    for (const id of KEY_ORDER) {
      expect(screen.getByTestId(id)).toHaveStyle({ backgroundColor: darkColors.surface });
    }
    expect(screen.getByTestId('score-btn-1')).toHaveStyle({ borderColor: darkColors.borderStrong, borderWidth: 1 });
  });
});

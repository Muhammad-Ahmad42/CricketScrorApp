import '../../testing';
import { act, screen, userEvent } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { lightColors } from '../../theme';
import { ResultLine, StatLine } from '..';

describe('StatLine', () => {
  it('marks the striker with a marker, a tint and heavier text, and says so in the label', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <StatLine
        kind="batter"
        name="Ali Khan"
        figure="42"
        secondary="(24)"
        detail="4s 3 · 6s 1"
        active
        accessibilityLabel="On strike: Ali Khan, 42 runs from 24 balls"
        accessibilityHint="Opens batter options"
        onPress={onPress}
        testID="score-row-striker"
        markerTestID="score-icon-striker"
      />,
    );
    const row = screen.getByRole('button', { name: 'On strike: Ali Khan, 42 runs from 24 balls' });
    expect(row).toHaveStyle({ backgroundColor: lightColors.accentSubtle });
    expect(screen.getByTestId('score-icon-striker', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Ali Khan', { includeHiddenElements: true })).toHaveStyle({ fontFamily: 'Inter_600SemiBold' });
    expect(screen.getByText('42', { includeHiddenElements: true })).toHaveStyle({ fontFamily: 'BarlowCondensed_500Medium', fontSize: 22 });
    expect(touchTargetSize(row).height).toBeGreaterThanOrEqual(44);
    await user.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('wraps a long name instead of cutting it off, keeping the figures on the row', async () => {
    const name = 'Alexander Montgomery Fairweather-Smythe';
    await renderWithTheme(<StatLine kind="batter" name={name} figure="7" secondary="(9)" accessibilityLabel={`Non-striker: ${name}, 7 from 9`} testID="score-row-non-striker" />);
    const text = screen.getByText(name, { includeHiddenElements: true });
    expect(text).not.toHaveProp('numberOfLines');
    expect(text.parent).toHaveStyle({ flexShrink: 1, minWidth: 0 });
    expect(screen.getByText('7', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('keeps the non-striker plain', async () => {
    await renderWithTheme(<StatLine kind="batter" name="Ahmed Shah" figure="31" secondary="(27)" accessibilityLabel="Non-striker: Ahmed Shah, 31 from 27" testID="score-row-non-striker" />);
    const row = screen.getByTestId('score-row-non-striker');
    expect(row).toHaveStyle({ backgroundColor: 'transparent' });
    expect(screen.getByText('Ahmed Shah', { includeHiddenElements: true })).toHaveStyle({ fontFamily: 'Inter_400Regular' });
  });

  it('shows the bowler with the current-bowler marker, figures and a labelled economy', async () => {
    await renderWithTheme(
      <StatLine
        kind="bowler"
        name="Hassan Ali"
        figure="3.4-0-28-2"
        secondary="7.63"
        secondaryLabel="ECO"
        active
        accessibilityLabel="Bowling: Hassan Ali, 3.4 overs, 0 maidens, 28 runs, 2 wickets"
        testID="score-row-bowler"
        markerTestID="bowler-marker"
      />,
    );
    expect(screen.getByLabelText('Bowling: Hassan Ali, 3.4 overs, 0 maidens, 28 runs, 2 wickets')).toBeOnTheScreen();
    expect(screen.getByTestId('bowler-marker', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('ECO', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('score-row-bowler')).toHaveStyle({ backgroundColor: 'transparent' });
  });
});

describe('ResultLine', () => {
  it('fades the result in after a short delay and draws the rule under it', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<ResultLine text="Lions won by 5 wickets (12 balls left)" />);
      const text = screen.getByTestId('result-text');
      expect(text).toHaveTextContent('Lions won by 5 wickets (12 balls left)');
      const wrapper = text.parent ?? text;
      expect(getAnimatedStyle(wrapper).opacity).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(getAnimatedStyle(wrapper).opacity).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the result at once with reduced motion', async () => {
    await renderWithTheme(<ResultLine text="Match tied" />, { reducedMotion: 'on' });
    expect(screen.getByTestId('result-text')).toHaveTextContent('Match tied');
  });
});

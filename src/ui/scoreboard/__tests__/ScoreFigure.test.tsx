import '../../testing';
import type { TextStyle } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme } from '../../testing';
import { darkColors, lightColors, parseColor } from '../../theme';
import { ScoreFigure, SIX_TINT_HOLD_MS, slotKeys } from '..';
import { rollLifetimeMs } from '../RollingChar';

function sameColor(actual: unknown, expected: string): boolean {
  const a = parseColor(String(actual));
  const e = parseColor(expected);
  return a.r === e.r && a.g === e.g && a.b === e.b && a.a === e.a;
}

function glyphs(char: string) {
  return screen.queryAllByText(char, { includeHiddenElements: true });
}

describe('ScoreFigure', () => {
  it('renders the formatted score as one accessible element with the spoken label', async () => {
    await renderWithTheme(<ScoreFigure value="142/4" accessibilityLabel="142 for 4" testID="score-text-total" />);
    const figure = screen.getByTestId('score-text-total');
    expect(figure).toHaveAccessibleName('142 for 4');
    expect(figure).toHaveTextContent('142/4');
  });

  it('sets the hero figure in Barlow Condensed, tabular, in the score ink and never scales it', async () => {
    await renderWithTheme(<ScoreFigure value="142/4" />, { mode: 'dark' });
    const digit = glyphs('1')[0];
    expect(digit).toHaveStyle({ fontFamily: 'BarlowCondensed_600SemiBold', fontVariant: ['tabular-nums'], fontSize: 64 });
    expect(digit.props.maxFontSizeMultiplier).toBe(1);
    expect(digit).toHaveStyle({ color: darkColors.score });
  });

  it('uses 52 on small phones and 72 in the tablet pane', async () => {
    const small = await renderWithTheme(<ScoreFigure value="9/0" size="compact" />);
    expect(glyphs('9')[0]).toHaveStyle({ fontSize: 52 });
    await small.unmount();
    await renderWithTheme(<ScoreFigure value="9/0" size="tablet" />);
    expect(glyphs('9')[0]).toHaveStyle({ fontSize: 72 });
  });

  it('keys digit slots from the right so the wicket and run digits stay put', () => {
    expect(slotKeys('99/4')).toEqual(['r3', 'r2', 'r1', 'r0']);
    expect(slotKeys('100/4').slice(-2)).toEqual(['r1', 'r0']);
  });

  it('rolls only the changed digits: the outgoing digit leaves after the base duration', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<ScoreFigure value="142/4" />);
      await view.rerender(<ScoreFigure value="146/4" />);
      expect(glyphs('2')).toHaveLength(1);
      expect(glyphs('6')).toHaveLength(1);
      expect(glyphs('4')).toHaveLength(2);
      expect(getAnimatedStyle(glyphs('6')[0]).opacity).toBe(0);
      await act(async () => {
        jest.advanceTimersByTime(250);
      });
      expect(glyphs('2')).toHaveLength(0);
      expect(glyphs('6')[0]).toHaveStyle({ color: lightColors.score });
      expect(glyphs('6')[0].props.jestAnimatedStyle).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('swaps digits instantly with reduced motion', async () => {
    const view = await renderWithTheme(<ScoreFigure value="142/4" />, { reducedMotion: 'on' });
    await view.rerender(<ScoreFigure value="142/5" />);
    expect(glyphs('4')).toHaveLength(1);
    expect(glyphs('5')).toHaveLength(1);
    expect(screen.getByLabelText('142/5')).toBeOnTheScreen();
    expect(rollLifetimeMs(true, false)).toBeLessThan(20);
    expect(rollLifetimeMs(false, true)).toBe(SIX_TINT_HOLD_MS + 200 + 16);
  });

  it('tints the new digits in accent after a six and returns to the score ink', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<ScoreFigure value="140/4" />);
      await view.rerender(<ScoreFigure value="146/4" flashAccent />);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(sameColor((getAnimatedStyle(glyphs('6')[0]) as TextStyle).color, lightColors.accent)).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(SIX_TINT_HOLD_MS + 400);
      });
      expect(glyphs('6')[0]).toHaveStyle({ color: lightColors.score });
    } finally {
      jest.useRealTimers();
    }
  });
});

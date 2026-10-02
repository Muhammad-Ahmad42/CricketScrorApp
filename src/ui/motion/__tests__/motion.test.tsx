import '../../testing';
import { Text as RNText } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme } from '../../testing';
import { motionDuration } from '../../theme';
import { DrawnRule, FLASH_HOLD_MS, REDUCED_FADE_MS, Reveal, timingFor } from '..';

function lineOf(testID: string) {
  const track = screen.getByTestId(testID, { includeHiddenElements: true });
  return track.children[0] as unknown as { props: Record<string, unknown> };
}

describe('motion tokens', () => {
  it('derives timings from the duration tokens and never lets the OS override the app setting', () => {
    expect(timingFor('base').duration).toBe(200);
    expect(timingFor('slow').duration).toBe(320);
    expect(timingFor('exit').duration).toBe(160);
    expect(timingFor('fast').reduceMotion).toBe('never');
    expect(REDUCED_FADE_MS).toBe(120);
  });
});

describe('Reveal', () => {
  it('rises and fades in with motion', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(
        <Reveal translateY={8} testID="reveal">
          <RNText>Panel</RNText>
        </Reveal>,
      );
      const node = screen.getByTestId('reveal');
      expect(getAnimatedStyle(node)).toMatchObject({ opacity: 0, transform: [{ translateY: 8 }, { scale: 1 }] });
      await act(async () => {
        jest.advanceTimersByTime(motionDuration.base + 50);
      });
      expect(getAnimatedStyle(node)).toMatchObject({ opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] });
    } finally {
      jest.useRealTimers();
    }
  });

  it('only crossfades, without translation or scale, under reduced motion', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(
        <Reveal translateY={8} scale={0.98} testID="reveal">
          <RNText>Panel</RNText>
        </Reveal>,
        { reducedMotion: 'on' },
      );
      const node = screen.getByTestId('reveal');
      expect(getAnimatedStyle(node).transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
      await act(async () => {
        jest.advanceTimersByTime(REDUCED_FADE_MS + 20);
      });
      expect(getAnimatedStyle(node)).toMatchObject({ opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('DrawnRule', () => {
  it('draws the wicket rule left to right, holds it and fades it', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<DrawnRule trigger={1} testID="wicket-rule" />);
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      const drawing = getAnimatedStyle(lineOf('wicket-rule'));
      expect(Number((drawing.transform as { scaleX: number }[])[0].scaleX)).toBeLessThan(1);
      await act(async () => {
        jest.advanceTimersByTime(motionDuration.slow + 20);
      });
      expect(getAnimatedStyle(lineOf('wicket-rule'))).toMatchObject({ opacity: 1, transform: [{ scaleX: 1 }] });
      await act(async () => {
        jest.advanceTimersByTime(FLASH_HOLD_MS + motionDuration.exit + 40);
      });
      expect(getAnimatedStyle(lineOf('wicket-rule')).opacity).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('appears and disappears without drawing under reduced motion', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<DrawnRule trigger="w1" testID="wicket-rule" />, { reducedMotion: 'on' });
      await act(async () => {
        jest.advanceTimersByTime(20);
      });
      expect(getAnimatedStyle(lineOf('wicket-rule'))).toMatchObject({ opacity: 1, transform: [{ scaleX: 1 }] });
      await act(async () => {
        jest.advanceTimersByTime(motionDuration.slow + FLASH_HOLD_MS + 20);
      });
      expect(getAnimatedStyle(lineOf('wicket-rule')).opacity).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stays hidden until triggered', async () => {
    await renderWithTheme(<DrawnRule trigger={null} testID="idle-rule" />);
    expect(getAnimatedStyle(lineOf('idle-rule')).opacity).toBe(0);
  });
});

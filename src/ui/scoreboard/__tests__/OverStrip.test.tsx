import '../../testing';
import { act, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme } from '../../testing';
import { OverStrip, overStripAccessibilityLabel, type OverBall } from '..';

const BALLS: readonly OverBall[] = [
  { text: '1', kind: 'runs', isFreeHit: false, accessibilityLabel: 'One run' },
  { text: '4', kind: 'four', isFreeHit: false, accessibilityLabel: 'Four runs' },
  { text: '0', kind: 'dot', isFreeHit: false, accessibilityLabel: 'Dot ball' },
  { text: 'W', kind: 'wicket', isFreeHit: false, accessibilityLabel: 'Wicket, bowled' },
  { text: 'WD', kind: 'wide', isFreeHit: false, accessibilityLabel: 'Wide' },
  { text: '2', kind: 'runs', isFreeHit: true, accessibilityLabel: 'Two runs' },
];

describe('OverStrip', () => {
  it('lists the chips of the over in order with their E2E ids and the over runs', async () => {
    await renderWithTheme(<OverStrip balls={BALLS} remaining={1} runs="8" />);
    const strip = screen.getByTestId('score-row-over');
    for (const [index, ball] of BALLS.entries()) {
      expect(screen.getByTestId(`score-chip-ball-${index + 1}`, { includeHiddenElements: true })).toHaveTextContent(ball.text);
    }
    expect(screen.getByText('THIS OVER', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('RUNS', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(strip).toHaveTextContent(/8/);
  });

  it('reads as one grouped sentence built from the domain labels', async () => {
    await renderWithTheme(<OverStrip balls={BALLS} remaining={2} runs="7" />);
    expect(screen.getByTestId('score-row-over')).toHaveAccessibleName(
      'This over: One run, Four runs, Dot ball, Wicket, bowled, Wide, Two runs, free hit. 2 balls left. 7 runs.',
    );
    expect(overStripAccessibilityLabel('OVER 17', [], 6, null)).toBe('Over 17: no balls yet. 6 balls left.');
    expect(overStripAccessibilityLabel(null, BALLS.slice(0, 1), 1, '1')).toBe('This over: One run. 1 ball left. 1 run.');
  });

  it('shows one placeholder circle for each legal ball still due', async () => {
    const view = await renderWithTheme(<OverStrip balls={BALLS.slice(0, 2)} remaining={4} />);
    const dotted = view.container.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('dotted'));
    expect(dotted).toHaveLength(4);
  });

  it('replaces the heading with the finished-over summary', async () => {
    await renderWithTheme(<OverStrip balls={BALLS} remaining={0} summary="Over 17 · 9 runs · Hassan" runs="9" />);
    expect(screen.getByText('Over 17 · 9 runs · Hassan', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('THIS OVER', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });

  it('drops the label on small phones and keeps the runs at the end', async () => {
    await renderWithTheme(<OverStrip balls={BALLS} remaining={1} label={null} runs="7" />);
    expect(screen.queryByText('THIS OVER', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.getByText('7', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('slides the next over in, or crossfades it with reduced motion', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderWithTheme(<OverStrip balls={BALLS} remaining={0} overKey={16} />);
      await view.rerender(<OverStrip balls={[]} remaining={6} overKey={17} />);
      const clip = view.container.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('overflow'))[0];
      expect(getAnimatedStyle(clip).opacity).toBe(1);
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(getAnimatedStyle(clip).transform).toEqual([{ translateX: 0 }]);
      await view.unmount();

      const reduced = await renderWithTheme(<OverStrip balls={BALLS} remaining={0} overKey={16} />, { reducedMotion: 'on' });
      await reduced.rerender(<OverStrip balls={[]} remaining={6} overKey={17} />);
      const fade = reduced.container.queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('overflow'))[0];
      await act(async () => {
        jest.advanceTimersByTime(60);
      });
      expect(Number(getAnimatedStyle(fade).opacity)).toBeLessThan(1);
      expect(getAnimatedStyle(fade).transform).toEqual([{ translateX: 0 }]);
    } finally {
      jest.useRealTimers();
    }
  });
});

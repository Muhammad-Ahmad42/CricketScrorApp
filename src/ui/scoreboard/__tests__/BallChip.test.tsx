import '../../testing';
import { act, screen, userEvent, within } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { renderWithTheme, touchTargetSize } from '../../testing';
import { contrastRatio, darkColors, lightColors } from '../../theme';
import {
  BALL_CHIP_KINDS,
  BallChip,
  BallPlaceholder,
  CHIP_DIMENSIONS,
  FREE_HIT_MARK,
  ballChipLook,
  chipAccessibilityLabel,
  splitShortRun,
  type BallChipKind,
} from '..';

const SAMPLES: readonly [BallChipKind, string, string][] = [
  ['dot', '0', 'Dot ball'],
  ['runs', '2', 'Two runs'],
  ['four', '4', 'Four runs'],
  ['six', '6', 'Six runs'],
  ['wicket', 'W', 'Wicket, bowled'],
  ['wide', 'WD+1', 'Wide, plus one run'],
  ['no_ball', 'NB+2B', 'No ball, plus two byes'],
  ['bye', 'B1', 'One bye'],
  ['leg_bye', 'LB2', 'Two leg byes'],
];

function chipBody(testID: string) {
  const root = screen.getByTestId(testID);
  const nodes = root.queryAll((node) => node.type === 'View' && Boolean(node.props.style) && JSON.stringify(node.props.style).includes('minWidth'));
  return nodes[0];
}

describe('ball chip shape grammar', () => {
  it('uses a circle for runs off the bat, a capsule for byes, a dashed rectangle for illegal balls and a filled square for wickets', () => {
    expect(ballChipLook('dot').shape).toBe('circle');
    expect(ballChipLook('runs').shape).toBe('circle');
    expect(ballChipLook('four').shape).toBe('circle');
    expect(ballChipLook('six').shape).toBe('circle');
    expect(ballChipLook('bye').shape).toBe('capsule');
    expect(ballChipLook('leg_bye').shape).toBe('capsule');
    expect(ballChipLook('wide')).toMatchObject({ shape: 'rectangle', dashed: true, fill: null });
    expect(ballChipLook('no_ball')).toMatchObject({ shape: 'rectangle', dashed: true, fill: null });
    expect(ballChipLook('wicket')).toMatchObject({ shape: 'square', fill: 'danger', text: 'onDanger' });
  });

  it('distinguishes four from six by ring versus fill, not only colour', () => {
    expect(ballChipLook('four')).toMatchObject({ fill: null, border: 'accent', borderWidth: 2, text: 'accent' });
    expect(ballChipLook('six')).toMatchObject({ fill: 'accentDeep', border: null, text: 'onAccent' });
  });

  it('keeps boundaries restrained: no chip is painted in the bright highlight cyan (§107)', () => {
    for (const kind of BALL_CHIP_KINDS) {
      const look = ballChipLook(kind);
      expect([look.fill, look.border, look.text]).not.toContain('highlight');
    }
  });

  it('gives every kind a distinct combination of shape, fill, border and dash', () => {
    const signatures = new Set(
      BALL_CHIP_KINDS.filter((k) => k !== 'leg_bye' && k !== 'no_ball').map((kind) => {
        const look = ballChipLook(kind);
        return `${look.shape}|${look.fill}|${look.border}|${look.borderWidth}|${look.dashed}|${look.text}`;
      }),
    );
    expect(signatures.size).toBe(BALL_CHIP_KINDS.length - 2);
  });

  it('sets the documented sizes', () => {
    expect(CHIP_DIMENSIONS.lg).toMatchObject({ size: 32, font: 17, paddingX: 8 });
    expect(CHIP_DIMENSIONS.md.size).toBe(24);
    expect(CHIP_DIMENSIONS.sm.size).toBe(20);
  });
});

describe('<BallChip>', () => {
  it.each(SAMPLES)('renders a %s chip with its token text and the domain label', async (kind, text, label) => {
    await renderWithTheme(<BallChip kind={kind} text={text} accessibilityLabel={label} testID="chip" />);
    const chip = screen.getByTestId('chip');
    expect(chip).toHaveAccessibleName(label);
    expect(screen.getByText(text, { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('fills the wicket square with danger and writes W in the on-danger ink', async () => {
    await renderWithTheme(<BallChip kind="wicket" text="W" testID="chip" />);
    expect(chipBody('chip')).toHaveStyle({ backgroundColor: lightColors.danger, borderRadius: 2, width: undefined, height: 32 });
    expect(screen.getByText('W', { includeHiddenElements: true })).toHaveStyle({ color: lightColors.onDanger });
  });

  it('draws wides and no-balls with a dashed strong border and no fill', async () => {
    await renderWithTheme(<BallChip kind="wide" text="WD" testID="chip" />, { mode: 'dark' });
    expect(chipBody('chip')).toHaveStyle({ borderStyle: 'dashed', borderColor: darkColors.borderStrong, backgroundColor: 'transparent', borderRadius: 2 });
  });

  it('keeps run chips round and six filled with the deep teal', async () => {
    await renderWithTheme(<BallChip kind="six" text="6" testID="chip" />);
    expect(chipBody('chip')).toHaveStyle({ width: 32, height: 32, borderRadius: 16, backgroundColor: lightColors.accentDeep });
  });

  it('fills the dark six with the §107 deep teal and dark ink, not the routine-bright cyan', async () => {
    await renderWithTheme(<BallChip kind="six" text="6" testID="chip" />, { mode: 'dark' });
    expect(chipBody('chip')).toHaveStyle({ backgroundColor: darkColors.accentDeep });
    expect(darkColors.accentDeep).toBe('#008BA3');
    expect(chipBody('chip')).not.toHaveStyle({ backgroundColor: darkColors.highlight });
  });

  it('marks a free-hit ball with a visible FH label under a warning bar and says so in the label (§78)', async () => {
    await renderWithTheme(<BallChip kind="runs" text="1" isFreeHit accessibilityLabel="One run" testID="chip" />);
    expect(screen.getByTestId('chip')).toHaveAccessibleName('One run, free hit');
    const mark = screen.getByTestId('chip-free-hit', { includeHiddenElements: true });
    expect(within(mark).getByText(FREE_HIT_MARK, { includeHiddenElements: true })).toHaveStyle({ color: lightColors.warning });
    expect(FREE_HIT_MARK).toBe('FH');
    expect(chipAccessibilityLabel('4', undefined, false)).toBe('4');
  });

  it('sets the short-run marker as a smaller superscript', async () => {
    expect(splitShortRun('1s')).toEqual({ main: '1', suffix: 's' });
    expect(splitShortRun('WD+2s')).toEqual({ main: 'WD+2', suffix: 's' });
    expect(splitShortRun('LB1')).toEqual({ main: 'LB1', suffix: null });
    await renderWithTheme(<BallChip kind="runs" text="1s" accessibilityLabel="One run, one short" testID="chip" />);
    expect(screen.getByText('s', { includeHiddenElements: true })).toHaveStyle({ fontSize: 12 });
  });

  it('becomes an editable button with a 44 pt target in the ball log', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <BallChip kind="four" text="4" size="md" accessibilityLabel="Over 17 ball 2: Four runs" accessibilityHint="Edit this ball" onPress={onPress} testID="balls-row-17" />,
    );
    const button = screen.getByRole('button', { name: 'Over 17 ball 2: Four runs' });
    expect(touchTargetSize(button).height).toBeGreaterThanOrEqual(44);
    expect(touchTargetSize(button).width).toBeGreaterThanOrEqual(44);
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the placeholder from screen readers and draws its ring at 3:1 against the surface', async () => {
    await renderWithTheme(<BallPlaceholder testID="slot" />);
    expect(screen.queryByTestId('slot')).not.toBeOnTheScreen();
    expect(screen.getByTestId('slot', { includeHiddenElements: true })).toHaveStyle({ borderStyle: 'dotted', borderColor: lightColors.borderStrong, width: 32 });
    expect(contrastRatio(lightColors.borderStrong, lightColors.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('ball chip motion', () => {
  it('scales a boundary chip in and draws its ring once', async () => {
    jest.useFakeTimers();
    try {
      await renderWithTheme(<BallChip kind="six" text="6" animateIn testID="chip" />);
      const ring = screen
        .getByTestId('chip')
        .queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('"borderWidth":2') && JSON.stringify(node.props.style ?? '').includes('absolute'));
      expect(ring.length).toBeGreaterThan(0);
      expect(ring[0]).toHaveStyle({ borderColor: lightColors.accent });
      expect(Number(getAnimatedStyle(ring[0]).opacity)).toBeLessThanOrEqual(0.6);
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(Number(getAnimatedStyle(ring[0]).opacity)).toBeCloseTo(0, 2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('appears instantly without a ring under reduced motion', async () => {
    await renderWithTheme(<BallChip kind="four" text="4" animateIn testID="chip" />, { reducedMotion: 'on' });
    const rings = screen
      .getByTestId('chip')
      .queryAll((node) => node.type === 'View' && JSON.stringify(node.props.style ?? '').includes('absolute'));
    expect(rings).toHaveLength(0);
    expect(chipBody('chip').props.jestAnimatedStyle).toBeUndefined();
    expect(chipBody('chip')).toHaveStyle({ borderColor: lightColors.accent, borderWidth: 2 });
  });
});

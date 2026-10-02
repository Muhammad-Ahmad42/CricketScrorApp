import '../../testing';
import { screen } from '@testing-library/react-native';
import { renderWithTheme } from '../../testing';
import { createTheme, darkColors, lightColors } from '../../theme';
import {
  FONT_ASSETS,
  MIN_TEXT_SIZE,
  TEXT_VARIANTS,
  Text,
  fontFamily,
  maxScaleFor,
  textStyle,
  type NumericVariant,
  type TextVariant,
} from '..';

const NUMERIC: readonly NumericVariant[] = ['scoreHero', 'scoreLarge', 'scoreMedium', 'scoreKey', 'figure', 'figureSmall'];
const ALL = Object.keys(TEXT_VARIANTS) as TextVariant[];

describe('type scale', () => {
  it('sets Barlow Condensed with tabular figures on every scoreboard numeral style', () => {
    const theme = createTheme('light');
    for (const variant of NUMERIC) {
      const style = textStyle(variant, theme);
      expect(String(style.fontFamily)).toMatch(/^BarlowCondensed_/);
      expect(style.fontVariant).toEqual(['tabular-nums']);
    }
    expect(textStyle('tableNumeric', theme).fontVariant).toEqual(['tabular-nums']);
    expect(String(textStyle('tableNumeric', theme).fontFamily)).toMatch(/^Inter_/);
  });

  it('uses the documented sizes for the score styles', () => {
    expect(TEXT_VARIANTS.scoreHero).toMatchObject({ size: 64, lineHeight: 64, tracking: -0.5 });
    expect(TEXT_VARIANTS.scoreLarge).toMatchObject({ size: 40, lineHeight: 44 });
    expect(TEXT_VARIANTS.scoreKey).toMatchObject({ size: 32, lineHeight: 36 });
    expect(TEXT_VARIANTS.figureSmall).toMatchObject({ size: 17, lineHeight: 20 });
  });

  it('never goes below 12 pt, and only the uppercase label styles reach 12', () => {
    for (const variant of ALL) {
      const spec = TEXT_VARIANTS[variant];
      expect(spec.size).toBeGreaterThanOrEqual(MIN_TEXT_SIZE);
      if (spec.size === MIN_TEXT_SIZE) {
        expect(spec.uppercase).toBe(true);
      }
    }
  });

  it('applies the RESPONSIVE §5 font-scaling caps', () => {
    expect(maxScaleFor('scoreHero')).toBe(1);
    expect(maxScaleFor('scoreLarge')).toBe(1);
    expect(maxScaleFor('scoreKey')).toBe(1.2);
    expect(maxScaleFor('keyLabel')).toBe(1.2);
    expect(maxScaleFor('figureSmall')).toBe(1.3);
    expect(maxScaleFor('title1')).toBe(1.6);
    expect(maxScaleFor('body')).toBe(2);
    expect(maxScaleFor('label')).toBe(1.5);
    expect(maxScaleFor('tableNumeric')).toBe(1.5);
  });

  it('only references the seven bundled font files', () => {
    expect(Object.keys(FONT_ASSETS).sort()).toEqual(Object.values(fontFamily).sort());
    const families = new Set(ALL.map((variant) => textStyle(variant, createTheme('light')).fontFamily));
    for (const family of families) {
      expect(Object.values(fontFamily)).toContain(family);
    }
  });

  it('bumps the weight one step when the OS asks for bold text', () => {
    const bold = createTheme('light', { highContrast: false, reducedMotion: false, boldText: true });
    expect(textStyle('body', bold).fontFamily).toBe(fontFamily.inter500);
    expect(textStyle('bodyStrong', bold).fontFamily).toBe(fontFamily.inter700);
    expect(textStyle('scoreHero', bold).fontFamily).toBe(fontFamily.barlow700);
  });
});

describe('<Text>', () => {
  it('renders body text in the primary ink by default', async () => {
    await renderWithTheme(<Text>Lions won by 5 wickets</Text>);
    const node = screen.getByText('Lions won by 5 wickets');
    expect(node).toHaveStyle({ color: lightColors.textPrimary, fontSize: 16, fontFamily: fontFamily.inter400 });
    expect(node.props.maxFontSizeMultiplier).toBe(2);
  });

  it('maps tones to theme tokens and follows the dark theme', async () => {
    await renderWithTheme(
      <Text variant="label" tone="secondary">
        This over
      </Text>,
      { mode: 'dark' },
    );
    expect(screen.getByText('This over')).toHaveStyle({ color: darkColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 });
  });

  it('caps the hero score at its own size', async () => {
    await renderWithTheme(<Text variant="scoreHero">142/4</Text>);
    const node = screen.getByText('142/4');
    expect(node.props.maxFontSizeMultiplier).toBe(1);
    expect(node).toHaveStyle({ fontVariant: ['tabular-nums'], fontSize: 64 });
  });

  it('lets the weight be overridden within the same family', async () => {
    await renderWithTheme(
      <Text variant="subhead" weight="semibold">
        Striker
      </Text>,
    );
    expect(screen.getByText('Striker')).toHaveStyle({ fontFamily: fontFamily.inter600 });
  });
});

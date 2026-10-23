import { composite, contrastRatio, createTheme, darkColors, lightColors, parseColor, relativeLuminance, type ColorToken } from '..';

type Pair = readonly [ColorToken, ColorToken, number, number | null, number];

const PAIRS: readonly Pair[] = [
  ['textPrimary', 'background', 14.83, 18, 4.5],
  ['textPrimary', 'surface', 16.29, 16.82, 4.5],
  ['textPrimary', 'surfaceElevated', 16.29, 15.23, 4.5],
  ['textPrimary', 'surfaceSunken', 13.47, 18.53, 4.5],
  ['textSecondary', 'background', 6.88, 7.72, 4.5],
  ['textSecondary', 'surface', 7.56, 7.22, 4.5],
  ['textSecondary', 'surfaceElevated', 7.56, 6.53, 4.5],
  ['textSecondary', 'surfaceSunken', 6.25, 7.95, 4.5],
  ['textMuted', 'background', 5.13, 6.35, 4.5],
  ['textMuted', 'surface', 5.63, 5.93, 4.5],
  ['textMuted', 'surfaceElevated', 5.63, 5.37, 4.5],
  ['textMuted', 'surfaceSunken', 4.66, 6.53, 4.5],
  ['score', 'background', 16.25, 18.82, 3],
  ['score', 'surface', 17.85, 17.58, 3],
  ['accent', 'background', 6.59, 9.06, 4.5],
  ['accent', 'surface', 7.23, 8.47, 4.5],
  ['accent', 'surfaceElevated', 7.23, 7.67, 4.5],
  ['accent', 'accentSubtle', 6.09, 6.87, 4.5],
  ['onAccent', 'accent', 7.23, 9.28, 4.5],
  ['onAccent', 'accentPressed', 9.93, 6.76, 4.5],
  ['onAccent', 'accentDeep', 5.54, 4.95, 4.5],
  ['textPrimary', 'accentSubtle', 13.71, 13.63, 4.5],
  ['success', 'surface', 5.7, 9.54, 4.5],
  ['success', 'successSubtle', 4.88, 8.06, 4.5],
  ['warning', 'surface', 6.51, 10.49, 4.5],
  ['warning', 'warningSubtle', 5.72, 9.23, 4.5],
  ['danger', 'surface', 5.63, 5.69, 4.5],
  ['danger', 'background', 5.13, 6.09, 4.5],
  ['danger', 'dangerSubtle', 4.79, 5.41, 4.5],
  ['onDanger', 'danger', 5.63, 6.13, 4.5],
  ['textPrimary', 'warningSubtle', 14.32, 14.79, 4.5],
  ['textPrimary', 'dangerSubtle', 13.84, 15.99, 4.5],
  ['borderStrong', 'surface', 3.92, 3.68, 3],
  ['borderStrong', 'background', 3.57, 3.94, 3],
  ['focusRing', 'background', 3.66, 11.38, 3],
  ['focusRing', 'surface', 4.02, 10.63, 3],
  ['highlight', 'background', 3.66, 11.38, 3],
  ['highlight', 'surface', 4.02, 10.63, 3],
  ['chartSeries1', 'surface', 3.49, 6.01, 3],
  ['chartSeries2', 'surface', 6.17, 4.0, 3],
  ['chartSeries1', 'background', 3.18, 6.43, 3],
  ['chartSeries2', 'background', 5.62, 4.28, 3],
];

const TOLERANCE = 0.06;

describe('WCAG contrast of every component pairing (DESIGN_SYSTEM §1.3)', () => {
  it.each(PAIRS)('%s on %s meets its requirement in both themes', (fg, bg, lightDoc, darkDoc, requirement) => {
    const light = contrastRatio(lightColors[fg], lightColors[bg]);
    const dark = contrastRatio(darkColors[fg], darkColors[bg]);
    expect(light).toBeGreaterThanOrEqual(requirement);
    expect(dark).toBeGreaterThanOrEqual(requirement);
    expect(Math.abs(light - lightDoc)).toBeLessThan(TOLERANCE);
    if (darkDoc !== null) {
      expect(Math.abs(dark - darkDoc)).toBeLessThan(TOLERANCE);
    }
  });

  it('keeps toast text and actions readable on their surfaces', () => {
    expect(contrastRatio(lightColors.inverseText, lightColors.inverseSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightColors.inverseAccent, lightColors.inverseSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColors.textPrimary, darkColors.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkColors.inverseAccent, darkColors.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps every text token at 4.5:1 or more on every surface it is placed on, in both themes', () => {
    const texts: readonly ColorToken[] = ['textPrimary', 'textSecondary', 'textMuted', 'accent', 'danger', 'warning', 'success'];
    const surfaces: readonly ColorToken[] = ['background', 'surface', 'surfaceElevated'];
    for (const palette of [lightColors, darkColors]) {
      for (const text of texts) {
        for (const surface of surfaces) {
          expect(contrastRatio(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keeps the six chip digit readable on the deep teal fill and keeps the bright highlight off text in light (§107)', () => {
    for (const palette of [lightColors, darkColors]) {
      expect(contrastRatio(palette.onAccent, palette.accentDeep)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.highlight, palette.background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrastRatio(lightColors.highlight, lightColors.surface)).toBeLessThan(4.5);
    expect(contrastRatio('#008BA3', '#FFFFFF')).toBeLessThan(4.5);
    expect(contrastRatio(lightColors.accent, lightColors.surface)).toBeGreaterThanOrEqual(7);
  });

  it('keeps large score text above 3:1 on the scoring pad well and pressed keys', () => {
    for (const palette of [lightColors, darkColors]) {
      expect(contrastRatio(palette.score, palette.surfaceSunken)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.score, palette.accentSubtle)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(palette.danger, palette.dangerSubtle)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('only lets the decorative hairline fall below 3:1', () => {
    expect(contrastRatio(lightColors.border, lightColors.surface)).toBeLessThan(3);
    expect(contrastRatio(darkColors.border, darkColors.surface)).toBeLessThan(3);
  });
});

describe('high contrast palette', () => {
  it.each(['light', 'dark'] as const)('promotes secondary and muted text to primary and hairlines to the strong border in %s', (scheme) => {
    const theme = createTheme(scheme, { highContrast: true, reducedMotion: false, boldText: false });
    expect(theme.color.textSecondary).toBe(theme.color.textPrimary);
    expect(theme.color.textMuted).toBe(theme.color.textPrimary);
    expect(theme.color.border).toBe(theme.color.borderStrong);
    expect(theme.borderWidth.hairline).toBe(1);
  });
});

describe('colour maths', () => {
  it('computes the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777', '#777777')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('parses rgba and composites translucent colours over their background', () => {
    const scrim = parseColor(lightColors.scrim);
    expect(scrim).toEqual({ r: 6, g: 26, b: 32, a: 0.4 });
    const mixed = composite(scrim, parseColor('#FFFFFF'));
    expect(mixed.r).toBeCloseTo(6 * 0.4 + 255 * 0.6, 5);
    expect(contrastRatio('rgba(0,0,0,0.5)', '#FFFFFF')).toBeGreaterThan(1);
  });

  it('rejects unsupported colour syntax', () => {
    expect(() => parseColor('tomato')).toThrow('Unsupported colour');
  });
});

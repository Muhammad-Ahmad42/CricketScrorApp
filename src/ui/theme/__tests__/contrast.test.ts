import { composite, contrastRatio, createTheme, darkColors, lightColors, parseColor, relativeLuminance, type ColorToken } from '..';

type Pair = readonly [ColorToken, ColorToken, number, number | null, number];

const PAIRS: readonly Pair[] = [
  ['textPrimary', 'background', 15.45, 15.87, 4.5],
  ['textPrimary', 'surface', 17.16, 14.74, 4.5],
  ['textPrimary', 'surfaceElevated', 17.16, 13.17, 4.5],
  ['textPrimary', 'surfaceSunken', 14.13, 16.69, 4.5],
  ['textSecondary', 'background', 7.71, 9.45, 4.5],
  ['textSecondary', 'surface', 8.56, 8.78, 4.5],
  ['textSecondary', 'surfaceElevated', 8.56, 7.84, 4.5],
  ['textMuted', 'background', 4.99, 6.1, 4.5],
  ['textMuted', 'surface', 5.54, 5.67, 4.5],
  ['textMuted', 'surfaceElevated', 5.54, 5.06, 4.5],
  ['textMuted', 'surfaceSunken', 4.56, 6.41, 4.5],
  ['score', 'background', 16.82, 17.23, 3],
  ['score', 'surface', 18.68, 16.01, 3],
  ['accent', 'background', 7.14, 8.37, 4.5],
  ['accent', 'surface', 7.92, 7.78, 4.5],
  ['accent', 'surfaceElevated', 7.92, 6.95, 4.5],
  ['accent', 'accentSubtle', 6.55, 6.11, 4.5],
  ['onAccent', 'accent', 7.92, 8.12, 4.5],
  ['onAccent', 'accentPressed', 10.22, 6.32, 4.5],
  ['textPrimary', 'accentSubtle', 14.18, 11.59, 4.5],
  ['success', 'surface', 6.53, 8.38, 4.5],
  ['success', 'successSubtle', 5.52, 6.85, 4.5],
  ['warning', 'surface', 6.33, 9.05, 4.5],
  ['warning', 'warningSubtle', 5.55, 7.49, 4.5],
  ['danger', 'surface', 6.54, 7.04, 4.5],
  ['danger', 'background', 5.89, 7.57, 4.5],
  ['danger', 'dangerSubtle', 5.54, 6.21, 4.5],
  ['onDanger', 'danger', 6.54, 7.68, 4.5],
  ['textPrimary', 'warningSubtle', 15.04, 12.2, 4.5],
  ['textPrimary', 'dangerSubtle', 14.53, 13.01, 4.5],
  ['borderStrong', 'surface', 3.6, 3.25, 3],
  ['borderStrong', 'background', 3.24, 3.5, 3],
  ['focusRing', 'background', 7.14, 10.87, 3],
  ['focusRing', 'surface', 7.92, 10.1, 3],
  ['chartSeries1', 'surface', 4.94, 5.95, 3],
  ['chartSeries2', 'surface', 4.85, 5.67, 3],
  ['chartSeries1', 'background', 4.45, 6.4, 3],
  ['chartSeries2', 'background', 4.37, 6.1, 3],
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
    expect(scrim).toEqual({ r: 17, g: 19, b: 16, a: 0.4 });
    const mixed = composite(scrim, parseColor('#FFFFFF'));
    expect(mixed.r).toBeCloseTo(17 * 0.4 + 255 * 0.6, 5);
    expect(contrastRatio('rgba(0,0,0,0.5)', '#FFFFFF')).toBeGreaterThan(1);
  });

  it('rejects unsupported colour syntax', () => {
    expect(() => parseColor('tomato')).toThrow('Unsupported colour');
  });
});

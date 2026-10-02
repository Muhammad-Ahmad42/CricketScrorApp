import {
  CORE_COLOR_TOKENS,
  EXTENDED_COLOR_TOKENS,
  SPACING_SCALE,
  darkColors,
  lightColors,
  motionDuration,
  parseColor,
  radius,
  space,
  type ColorToken,
  type ColorTokens,
} from '..';

const DOCUMENTED: { readonly [K in ColorToken]: readonly [string, string] } = {
  background: ['#F5F3EC', '#111412'],
  surface: ['#FFFFFF', '#181C19'],
  surfaceElevated: ['#FFFFFF', '#212622'],
  textPrimary: ['#1A1C19', '#ECEEE9'],
  textSecondary: ['#474E49', '#B4BBB4'],
  textMuted: ['#646A65', '#8E968F'],
  border: ['#DDD9CE', '#2B312D'],
  accent: ['#1F5C3A', '#72BE90'],
  success: ['#276A3E', '#7CC49A'],
  warning: ['#8A5300', '#E3B55E'],
  danger: ['#B3261E', '#EE8A7F'],
  score: ['#111310', '#F6F7F3'],
  surfaceSunken: ['#ECE9E0', '#0B0D0C'],
  borderStrong: ['#8A877C', '#646E66'],
  accentPressed: ['#174A2D', '#5FA87C'],
  accentSubtle: ['#E2ECE4', '#1C3326'],
  onAccent: ['#FFFFFF', '#0A1A10'],
  successSubtle: ['#E3EFE6', '#1A3023'],
  warningSubtle: ['#FAEFD9', '#33291A'],
  dangerSubtle: ['#FBE8E6', '#3A1E1B'],
  onDanger: ['#FFFFFF', '#240907'],
  focusRing: ['#1F5C3A', '#9AD3AF'],
  scrim: ['rgba(17,19,16,0.40)', 'rgba(0,0,0,0.60)'],
  inverseSurface: ['#1A1C19', '#ECEEE9'],
  inverseText: ['#F5F3EC', '#111412'],
  inverseAccent: ['#9AD3AF', '#72BE90'],
  chartSeries1: ['#2A7F50', '#55A877'],
  chartSeries2: ['#4A6FC0', '#7792DA'],
  chartGrid: ['#E7E4DA', '#252A26'],
};

const ALL_TOKENS: readonly ColorToken[] = [...CORE_COLOR_TOKENS, ...EXTENDED_COLOR_TOKENS];

function inversionDistance(light: string, dark: string): number {
  const l = parseColor(light);
  const d = parseColor(dark);
  return Math.abs(255 - l.r - d.r) + Math.abs(255 - l.g - d.g) + Math.abs(255 - l.b - d.b);
}

function hue(color: string): number {
  const { r, g, b } = parseColor(color);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) {
    return 0;
  }
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (raw * 60 + 360) % 360;
}

describe('colour tokens', () => {
  it('lists exactly the twelve §71 semantic tokens as core tokens', () => {
    expect([...CORE_COLOR_TOKENS].sort()).toEqual(
      ['background', 'surface', 'surfaceElevated', 'textPrimary', 'textSecondary', 'textMuted', 'border', 'accent', 'success', 'warning', 'danger', 'score'].sort(),
    );
  });

  it.each(['light', 'dark'] as const)('defines every core and extended token as a parseable colour in the %s theme', (scheme) => {
    const palette: ColorTokens = scheme === 'light' ? lightColors : darkColors;
    expect(Object.keys(palette).sort()).toEqual([...ALL_TOKENS].sort());
    for (const token of ALL_TOKENS) {
      expect(typeof palette[token]).toBe('string');
      expect(() => parseColor(palette[token])).not.toThrow();
    }
  });

  it('matches the documented values of DESIGN_SYSTEM §1.1 and §1.2', () => {
    for (const token of ALL_TOKENS) {
      expect([lightColors[token].toUpperCase(), darkColors[token].toUpperCase()]).toEqual([
        DOCUMENTED[token][0].toUpperCase(),
        DOCUMENTED[token][1].toUpperCase(),
      ]);
    }
  });

  it('designs the dark theme separately: no core token is shared with light, and the palette is not an inversion', () => {
    for (const token of CORE_COLOR_TOKENS) {
      expect(darkColors[token]).not.toBe(lightColors[token]);
    }
    const distances = ALL_TOKENS.filter((token) => token !== 'scrim').map((token) => inversionDistance(lightColors[token], darkColors[token]));
    const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    expect(mean).toBeGreaterThan(60);
  });

  it('keeps the hue of every chromatic token instead of flipping it as an inversion would', () => {
    const chromatic: readonly ColorToken[] = ['accent', 'success', 'warning', 'danger', 'chartSeries1', 'chartSeries2', 'accentSubtle', 'warningSubtle', 'dangerSubtle', 'successSubtle'];
    for (const token of chromatic) {
      const delta = Math.abs(hue(lightColors[token]) - hue(darkColors[token]));
      expect(Math.min(delta, 360 - delta)).toBeLessThan(45);
    }
  });

  it('keeps the dark theme free of shadows by giving elevation to tone: surfaces step up in lightness', () => {
    const luminance = (hex: string) => {
      const { r, g, b } = parseColor(hex);
      return r + g + b;
    };
    expect(luminance(darkColors.surfaceSunken)).toBeLessThan(luminance(darkColors.background));
    expect(luminance(darkColors.background)).toBeLessThan(luminance(darkColors.surface));
    expect(luminance(darkColors.surface)).toBeLessThan(luminance(darkColors.surfaceElevated));
  });
});

describe('spacing, radius and motion tokens', () => {
  it('uses exactly the §67 spacing scale', () => {
    expect([...SPACING_SCALE]).toEqual([4, 8, 12, 16, 20, 24, 32, 40, 48]);
    expect(Object.values(space)).toEqual([...SPACING_SCALE]);
  });

  it('never rounds anything beyond 10', () => {
    expect(Math.max(...Object.values(radius))).toBe(10);
    expect(radius.none).toBe(0);
  });

  it('defines the §8 motion durations', () => {
    expect(motionDuration).toEqual({ instant: 0, fast: 120, base: 200, slow: 320, exit: 160 });
  });
});

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
  background: ['#F0F5F8', '#070E12'],
  surface: ['#FFFFFF', '#0D171C'],
  surfaceElevated: ['#FFFFFF', '#132129'],
  textPrimary: ['#0B232B', '#F2F7F9'],
  textSecondary: ['#3D5864', '#8FA7B3'],
  textMuted: ['#526B77', '#7F97A3'],
  border: ['#D5E0E6', '#1A2A33'],
  accent: ['#00606F', '#00C2E0'],
  success: ['#0C7552', '#35D49A'],
  warning: ['#8A5000', '#FFB74D'],
  danger: ['#C42B2B', '#FF5252'],
  score: ['#061A20', '#F8FCFD'],
  surfaceSunken: ['#E2EBF0', '#04090C'],
  borderStrong: ['#6E848E', '#5A7482'],
  accentPressed: ['#004A56', '#00A5BF'],
  accentSubtle: ['#DCEFF3', '#0A2C36'],
  onAccent: ['#FFFFFF', '#010B0E'],
  successSubtle: ['#DDF2E9', '#0B2A22'],
  warningSubtle: ['#FBEFDA', '#2A2014'],
  dangerSubtle: ['#FCE8E8', '#2D1316'],
  onDanger: ['#FFFFFF', '#1C0506'],
  focusRing: ['#008BA3', '#28D9F2'],
  scrim: ['rgba(6,26,32,0.40)', 'rgba(2,7,9,0.64)'],
  inverseSurface: ['#0B232B', '#E3ECF0'],
  inverseText: ['#F0F5F8', '#070E12'],
  inverseAccent: ['#5ED3E8', '#00C2E0'],
  chartSeries1: ['#0A96B2', '#19A2BE'],
  chartSeries2: ['#6650B8', '#7A64D6'],
  chartGrid: ['#E1E9ED', '#16242B'],
  accentDeep: ['#007385', '#008BA3'],
  highlight: ['#008BA3', '#28D9F2'],
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
    const chromatic: readonly ColorToken[] = [
      'accent',
      'accentDeep',
      'highlight',
      'success',
      'warning',
      'danger',
      'chartSeries1',
      'chartSeries2',
      'accentSubtle',
      'warningSubtle',
      'dangerSubtle',
      'successSubtle',
    ];
    for (const token of chromatic) {
      const delta = Math.abs(hue(lightColors[token]) - hue(darkColors[token]));
      expect(Math.min(delta, 360 - delta)).toBeLessThan(45);
    }
  });

  it('builds the §107 identity on cyan and deep teal: every accent-family token sits in the cyan-teal hue band in both themes', () => {
    for (const palette of [lightColors, darkColors]) {
      for (const token of ['accent', 'accentPressed', 'accentDeep', 'accentSubtle', 'focusRing', 'highlight', 'chartSeries1'] as const) {
        expect(hue(palette[token])).toBeGreaterThanOrEqual(180);
        expect(hue(palette[token])).toBeLessThanOrEqual(200);
      }
    }
    expect(darkColors.background).toBe('#070E12');
    expect(darkColors.accent).toBe('#00C2E0');
    expect(darkColors.accentDeep).toBe('#008BA3');
    expect(darkColors.highlight).toBe('#28D9F2');
    expect(lightColors.background).toBe('#F0F5F8');
  });

  it('keeps green to the small success signal only, never the identity or a chart series (§107)', () => {
    for (const palette of [lightColors, darkColors]) {
      const greens = (Object.keys(palette) as ColorToken[]).filter((token) => {
        const value = parseColor(palette[token]);
        const h = hue(palette[token]);
        const chroma = Math.max(value.r, value.g, value.b) - Math.min(value.r, value.g, value.b);
        return value.a === 1 && chroma > 40 && h >= 90 && h < 170;
      });
      expect(greens.sort()).toEqual(['success']);
      const h2 = hue(palette.chartSeries2);
      expect(h2).toBeGreaterThanOrEqual(240);
      expect(h2).toBeLessThanOrEqual(270);
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

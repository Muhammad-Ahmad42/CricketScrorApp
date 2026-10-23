/** @jest-environment node */
import {
  GLASS_BACKDROP,
  GLASS_BLUR_SIGMA_PER_UNIT,
  GLASS_INK_LEVELS,
  GLASS_INKS,
  GLASS_LEVELS,
  GLASS_SCRIM_LEVELS,
  bandCoverage,
  compositeLayers,
  contrastOnLayers,
  createTheme,
  darkColors,
  darkGlass,
  discCoverage,
  erf,
  formatRgb,
  glassBackdrops,
  glassBlurSigma,
  glassCoverage,
  glassInkColors,
  glassInkFor,
  glassLayerStacks,
  glassRadius,
  glassRimFor,
  lightColors,
  lightGlass,
  mixColors,
  parseColor,
  relativeLuminance,
  withAlpha,
  worstGlassContrast,
  type ColorToken,
  type ColorTokens,
  type GlassBackdropMode,
  type GlassLevel,
  type GlassPalette,
} from '..';

const TEXT_TOKENS: readonly ColorToken[] = ['textPrimary', 'textSecondary', 'textMuted', 'accent', 'success', 'warning', 'danger', 'score'];

const SCHEMES: readonly { readonly name: 'light' | 'dark'; readonly color: ColorTokens; readonly glass: GlassPalette }[] = [
  { name: 'light', color: lightColors, glass: lightGlass },
  { name: 'dark', color: darkColors, glass: darkGlass },
];

const MODES: readonly GlassBackdropMode[] = ['blurred', 'unblurred'];

const CASES = SCHEMES.flatMap((scheme) => MODES.map((mode) => ({ ...scheme, mode })));

function failuresFor(glass: GlassPalette, color: ColorTokens, level: GlassLevel, inks: readonly ColorToken[], mode: GlassBackdropMode, overlays: readonly string[] = []): string[] {
  return inks
    .map((ink) => ({ ink, worst: worstGlassContrast(glass, color, level, glassInkFor(glass, color, level, ink), mode, overlays) }))
    .filter(({ worst }) => worst.ratio < 4.5)
    .map(({ ink, worst }) => `${level} ${ink} over ${worst.layers.join(' + ')} on ${formatRgb(worst.backdrop)}: ${worst.ratio.toFixed(2)}`);
}

function alphaOf(value: string): number {
  return parseColor(value).a;
}

describe('glass material tokens (§106)', () => {
  it('defines every level in both themes with a blurred tint, a denser unblurred tint, an opaque twin of the same RGB and a blur', () => {
    for (const { glass } of SCHEMES) {
      expect(Object.keys(glass.level).sort()).toEqual([...GLASS_LEVELS].sort());
      for (const level of GLASS_LEVELS) {
        const tokens = glass.level[level];
        const tint = parseColor(tokens.tint);
        const unblurred = parseColor(tokens.unblurred);
        const opaque = parseColor(tokens.opaque);
        expect(tint.a).toBeGreaterThan(0.5);
        expect(unblurred.a).toBeGreaterThan(tint.a);
        expect(unblurred.a).toBeLessThan(1);
        expect(opaque.a).toBe(1);
        expect([unblurred.r, unblurred.g, unblurred.b]).toEqual([tint.r, tint.g, tint.b]);
        expect([opaque.r, opaque.g, opaque.b]).toEqual([tint.r, tint.g, tint.b]);
        expect(tokens.blur).toBeGreaterThanOrEqual(60);
        expect(tokens.blur).toBeLessThanOrEqual(100);
      }
    }
  });

  it('makes unblurred glass near-opaque so text under the bar, sheets, dialogs and toasts cannot be read through it (Android QA)', () => {
    for (const { glass } of SCHEMES) {
      for (const level of GLASS_LEVELS) {
        const tint = glass.level[level].unblurred;
        const ghost = relativeLuminance(compositeLayers([tint], '#FFFFFF'));
        const shade = relativeLuminance(compositeLayers([tint], '#000000'));
        const ratio = (Math.max(ghost, shade) + 0.05) / (Math.min(ghost, shade) + 0.05);
        const limit = level === 'sheet' || level === 'popover' ? 1.05 : 1.06;
        expect({ level, ratio: ratio <= limit }).toEqual({ level, ratio: true });
        expect(alphaOf(tint)).toBeGreaterThanOrEqual(level === 'sheet' || level === 'popover' ? 0.985 : 0.98);
      }
    }
  });

  it('keeps the blurred material perceptibly translucent: short-text chrome light, dense-text surfaces denser', () => {
    expect(alphaOf(lightGlass.level.bar.tint)).toBeLessThanOrEqual(0.62);
    expect(alphaOf(lightGlass.level.control.tint)).toBeLessThanOrEqual(0.66);
    expect(alphaOf(lightGlass.level.dock.tint)).toBeLessThanOrEqual(0.7);
    expect(alphaOf(darkGlass.level.bar.tint)).toBeLessThanOrEqual(0.72);
    expect(alphaOf(darkGlass.level.control.tint)).toBeLessThanOrEqual(0.72);
    expect(alphaOf(darkGlass.level.dock.tint)).toBeLessThanOrEqual(0.78);
    for (const { glass } of SCHEMES) {
      expect(alphaOf(glass.level.popover.tint)).toBeLessThanOrEqual(0.9);
      expect(alphaOf(glass.level.sheet.tint)).toBeLessThanOrEqual(0.9);
    }
    expect(alphaOf(lightGlass.level.sheet.tint)).toBeGreaterThan(alphaOf(lightGlass.level.bar.tint));
    expect(alphaOf(lightGlass.level.popover.tint)).toBeGreaterThan(alphaOf(lightGlass.level.bar.tint));
    expect(alphaOf(darkGlass.level.popover.tint)).toBeGreaterThan(alphaOf(darkGlass.level.bar.tint));
  });

  it('uses the §107 dark glass rgba(15,27,34,0.70) as is for bars, made legible by glass inks rather than a denser tint', () => {
    expect(darkGlass.level.bar.tint).toBe('rgba(15,27,34,0.70)');
    const dock = parseColor(darkGlass.level.dock.tint);
    expect([dock.r, dock.g, dock.b]).toEqual([15, 27, 34]);
    expect(dock.a - 0.7).toBeLessThanOrEqual(0.08);
    expect(worstGlassContrast(darkGlass, darkColors, 'bar', darkColors.textSecondary, 'blurred').ratio).toBeLessThan(4.5);
    expect(worstGlassContrast(darkGlass, darkColors, 'bar', darkGlass.ink.secondary, 'blurred').ratio).toBeGreaterThanOrEqual(4.5);
    expect(worstGlassContrast(lightGlass, lightColors, 'bar', lightColors.accent, 'blurred').ratio).toBeLessThan(4.5);
    expect(worstGlassContrast(lightGlass, lightColors, 'bar', lightGlass.ink.accent, 'blurred').ratio).toBeGreaterThanOrEqual(4.5);
    expect(darkGlass.rim.color).toBe('rgba(0,194,224,0.20)');
  });

  it('keeps the tab bar liquid a balanced tint: the icon in it stays ≥ 3:1 and the accent caption below it ≥ 4.5:1 (cleanup brief, WCAG 1.4.11)', () => {
    for (const { glass, color } of SCHEMES) {
      const liquid = glass.liquid;
      expect(liquid.fillTop).toBeLessThan(liquid.fillBottom);
      expect(liquid.fillBottom).toBeLessThanOrEqual(0.32);
      expect(liquid.glowOpacity).toBeLessThanOrEqual(0.2);
      expect(liquid.lineOpacity).toBeLessThan(liquid.rimOpacity);
      expect(liquid.edgeOpacity).toBeLessThanOrEqual(0.5);
      expect(['accent', 'textPrimary']).toContain(liquid.ink);
      for (const mode of MODES) {
        const pool = [withAlpha(liquid.glow, liquid.glowOpacity), withAlpha(liquid.fill, liquid.fillBottom)];
        const litIcon = glassInkFor(glass, color, 'bar', liquid.ink);
        expect(worstGlassContrast(glass, color, 'bar', litIcon, mode, pool).ratio).toBeGreaterThanOrEqual(3);
        expect(worstGlassContrast(glass, color, 'bar', glass.ink.accent, mode).ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('swaps secondary, muted and accent ink for glass inks on the short-text levels only', () => {
    expect(GLASS_INK_LEVELS).toEqual(['bar', 'dock', 'control']);
    for (const { color, glass } of SCHEMES) {
      const inks = glassInkColors(glass, color);
      expect(inks.textSecondary).toBe(glass.ink.secondary);
      expect(inks.textMuted).toBe(glass.ink.secondary);
      expect(inks.accent).toBe(glass.ink.accent);
      expect(inks.textPrimary).toBe(color.textPrimary);
      expect(inks.danger).toBe(color.danger);
      expect(glassInkFor(glass, color, 'bar', 'accent')).toBe(glass.ink.accent);
      expect(glassInkFor(glass, color, 'sheet', 'accent')).toBe(color.accent);
      expect(glassInkFor(glass, color, 'popover', 'textSecondary')).toBe(color.textSecondary);
      expect(glassInkColors(glass, color, true).textSecondary).toBe(color.textPrimary);
    }
    expect(relativeLuminance(lightGlass.ink.secondary)).toBeLessThan(relativeLuminance(lightColors.textSecondary));
    expect(relativeLuminance(lightGlass.ink.accent)).toBeLessThan(relativeLuminance(lightColors.accent));
    expect(relativeLuminance(darkGlass.ink.secondary)).toBeGreaterThan(relativeLuminance(darkColors.textSecondary));
    expect(relativeLuminance(darkGlass.ink.secondary)).toBeLessThan(relativeLuminance(darkColors.textPrimary));
    expect(relativeLuminance(darkGlass.ink.accent)).toBeLessThan(relativeLuminance(darkColors.highlight));
  });

  it('makes the scoring dock the strongest glass: denser than the bars, with a stronger rim and a brighter lit edge', () => {
    for (const { glass } of SCHEMES) {
      expect(alphaOf(glass.level.dock.tint)).toBeGreaterThan(alphaOf(glass.level.bar.tint));
      expect(alphaOf(glass.level.dock.unblurred)).toBeGreaterThan(alphaOf(glass.level.bar.unblurred));
      const dock = glassRimFor(glass, 'dock');
      expect(dock).not.toBe(glass.rim);
      expect(alphaOf(dock.color)).toBeGreaterThan(alphaOf(glass.rim.color));
      expect(alphaOf(dock.top)).toBeGreaterThan(alphaOf(glass.rim.top));
      expect(alphaOf(dock.left)).toBeGreaterThan(alphaOf(glass.rim.left));
      for (const level of ['bar', 'control', 'popover', 'sheet'] as const) {
        expect(glassRimFor(glass, level)).toBe(glass.rim);
      }
    }
  });

  it('lights the top-left edge: the top rim is brightest, the left rim next, the rest stays the base rim', () => {
    for (const { glass } of SCHEMES) {
      for (const rim of [glass.rim, glassRimFor(glass, 'dock')]) {
        expect(alphaOf(rim.top)).toBeGreaterThan(alphaOf(rim.left));
        expect(alphaOf(rim.left)).toBeGreaterThan(alphaOf(rim.color));
        expect(rim.width).toBe(1);
      }
    }
  });

  it('designs light glass as a pale translucent white with near-white low-opacity rims', () => {
    for (const level of ['bar', 'dock', 'popover', 'sheet'] as const) {
      expect(relativeLuminance(lightGlass.level[level].tint)).toBeGreaterThan(0.9);
    }
    expect(relativeLuminance(lightGlass.level.control.tint)).toBeGreaterThan(0.8);
    for (const rim of [lightGlass.rim.color, lightGlass.rim.top, lightGlass.rim.left, glassRimFor(lightGlass, 'dock').top, lightGlass.sheen.from]) {
      const c = parseColor(rim);
      expect([c.r, c.g, c.b]).toEqual([255, 255, 255]);
      expect(c.a).toBeLessThan(0.95);
    }
    expect(alphaOf(lightGlass.rim.top)).toBeGreaterThan(alphaOf(lightGlass.rim.color));
    const edge = parseColor(lightGlass.edge.color);
    expect(edge.b).toBeGreaterThan(edge.r);
    expect(edge.g).toBeGreaterThan(edge.r);
    expect(edge.a).toBeGreaterThanOrEqual(0.25);
    expect(edge.a).toBeLessThanOrEqual(0.35);
    expect(lightGlass.edge.width).toBe(1);
    expect(alphaOf(lightGlass.sheen.from)).toBeGreaterThanOrEqual(0.6);
    expect(lightGlass.blurTint).toBe('light');
  });

  it('designs dark glass as a deep desaturated tint with a hue, never transparent black, and a soft coloured rim', () => {
    for (const level of GLASS_LEVELS) {
      const c = parseColor(darkGlass.level[level].tint);
      expect(c.a).toBeGreaterThanOrEqual(0.7);
      expect(relativeLuminance(darkGlass.level[level].tint)).toBeLessThan(0.02);
      expect(Math.min(c.r, c.g, c.b)).toBeGreaterThanOrEqual(8);
      expect(c.b - c.r).toBeGreaterThanOrEqual(5);
    }
    const dockRim = glassRimFor(darkGlass, 'dock');
    for (const rim of [darkGlass.rim.color, darkGlass.rim.top, darkGlass.rim.left, dockRim.color, dockRim.top, dockRim.left, darkGlass.sheen.from, darkGlass.selectionRim]) {
      const c = parseColor(rim);
      expect(c.r).toBeLessThan(c.g);
      expect(c.r).toBeLessThan(c.b);
      expect(c.a).toBeLessThanOrEqual(0.5);
    }
    expect(darkGlass.blurTint).toBe('dark');
  });

  it('lifts glass with a soft shadow in light only; dark elevation stays tonal (THEMES §2.2)', () => {
    expect(Number(lightGlass.shadow.shadowOpacity)).toBeLessThanOrEqual(0.1);
    expect(darkGlass.shadow).toEqual({});
  });

  it('uses larger, continuous radii for the glass chrome only', () => {
    expect(glassRadius.pill).toBeGreaterThan(200);
    expect(glassRadius.sheet).toBeGreaterThan(glassRadius.popover);
    expect(glassRadius.control).toBeGreaterThanOrEqual(12);
  });
});

describe('the backdrop model behind the contrast figures (THEMES §2.4, ACCESSIBILITY §7.1)', () => {
  it('states the blur radius as 0.24 px of Gaussian sigma per blur unit, so a full-strength level is the §107 24 px frost on web', () => {
    expect(GLASS_BLUR_SIGMA_PER_UNIT).toBe(0.24);
    expect(glassBlurSigma(100)).toBeCloseTo(24, 10);
    expect(glassBlurSigma(70)).toBeCloseTo(16.8, 10);
    expect(darkGlass.level.bar.blur).toBe(100);
    expect(darkGlass.level.dock.blur).toBe(100);
    for (const { glass } of SCHEMES) {
      for (const level of GLASS_LEVELS) {
        expect(glassBlurSigma(glass.level[level].blur)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('computes how much of a blurred field a block or a detail can still cover', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427, 4);
    expect(erf(-1)).toBeCloseTo(-0.8427, 4);
    expect(bandCoverage(56, 14)).toBeCloseTo(0.954, 3);
    expect(bandCoverage(56, 0)).toBe(1);
    expect(discCoverage(16, 14)).toBeCloseTo(0.48, 2);
    expect(discCoverage(16, 0)).toBe(1);
    const coverage = glassCoverage(100);
    expect(coverage.sigma).toBeCloseTo(24, 10);
    expect(coverage.block).toBeCloseTo(0.757, 3);
    expect(coverage.detail).toBeCloseTo(0.199, 3);
    expect(glassCoverage(90).detail).toBeGreaterThan(glassCoverage(100).detail);
    expect(glassCoverage(90).block).toBeGreaterThan(glassCoverage(100).block);
  });

  it('mixes blurred colours in both sRGB and linear light, so the darker and the brighter result are both modelled', () => {
    const srgb = mixColors('#000000', '#FFFFFF', 0.5, 'srgb');
    const linear = mixColors('#000000', '#FFFFFF', 0.5, 'linear');
    expect(srgb.g).toBeCloseTo(127.5, 6);
    expect(linear.g).toBeGreaterThan(185);
    expect(linear.g).toBeLessThan(189);
    expect(mixColors('#00606F', '#00606F', 0.4, 'linear').g).toBeCloseTo(96, 6);
    expect(GLASS_BACKDROP.spaces).toEqual(['srgb', 'linear']);
    expect(formatRgb({ r: 31.4, g: 300, b: -2, a: 1 })).toBe('rgb(31,255,0)');
  });

  it('treats button-sized fills as blocks the blur cannot average away, and text, icons and chips as detail', () => {
    expect(GLASS_BACKDROP.blocks).toEqual(expect.arrayContaining(['accent', 'accentDeep', 'danger', 'chartSeries1', 'chartSeries2']));
    expect(GLASS_BACKDROP.details).toEqual(expect.arrayContaining(['textPrimary', 'score', 'onAccent', 'onDanger', 'highlight']));
    expect(GLASS_BACKDROP.fields).toEqual(expect.arrayContaining(['background', 'surface', 'surfaceSunken']));
    expect(GLASS_BACKDROP.blockExtent).toBe(56);
    expect(GLASS_BACKDROP.detailRadius).toBe(16);
    expect(GLASS_BACKDROP.extremes).toEqual(['#FFFFFF', '#000000']);
  });

  it.each(SCHEMES)('includes the extreme raw backdrop only where nothing blurs ($name)', ({ name, color, glass }) => {
    const extreme = name === 'light' ? '#000000' : '#FFFFFF';
    const raw = glassBackdrops(glass, color, 'bar', 'unblurred').map(formatRgb);
    const blurred = glassBackdrops(glass, color, 'bar', 'blurred').map(formatRgb);
    expect(raw).toContain(formatRgb(parseColor(extreme)));
    expect(blurred).not.toContain(formatRgb(parseColor(extreme)));
    expect(blurred).toContain(formatRgb(mixColors(color.background, color.accent, glassCoverage(glass.level.bar.blur).block)));
  });

  it.each(SCHEMES)('puts the scrim under sheet backdrops only, because sheets and dialogs always sit on it ($name)', ({ color, glass }) => {
    expect(GLASS_SCRIM_LEVELS).toEqual(['sheet']);
    const plain = glassBackdrops(glass, color, 'popover', 'unblurred');
    const scrimmed = glassBackdrops(glass, color, 'sheet', 'unblurred');
    expect(scrimmed).toHaveLength(plain.length);
    expect(formatRgb(scrimmed[0])).toBe(formatRgb(compositeLayers([glass.scrim.color], plain[0])));
  });

  it.each(CASES)('counts the $name sheen both ways, so ink below the sheen and ink inside it are both checked ($mode)', ({ glass, mode }) => {
    for (const level of GLASS_LEVELS) {
      const stacks = glassLayerStacks(glass, level, mode);
      const base = mode === 'blurred' ? glass.level[level].tint : glass.level[level].unblurred;
      expect(stacks[0]).toEqual([base]);
      expect(stacks).toHaveLength(glass.level[level].sheen ? 2 : 1);
    }
  });

  it.each(SCHEMES)('the worst unblurred case for $name glass really is the extreme backdrop', ({ name, color, glass }) => {
    const tint = glass.level.bar.unblurred;
    const extreme = name === 'light' ? '#000000' : '#FFFFFF';
    const lum = (backdrop: string | ReturnType<typeof parseColor>) => relativeLuminance(compositeLayers([tint], backdrop));
    for (const backdrop of glassBackdrops(glass, color, 'bar', 'unblurred')) {
      if (name === 'light') {
        expect(lum(backdrop)).toBeGreaterThanOrEqual(lum(extreme));
      } else {
        expect(lum(backdrop)).toBeLessThanOrEqual(lum(extreme));
      }
    }
  });

  it.each(SCHEMES)('the blurred worst case for $name glass is a button-sized block or dense detail, never a raw extreme', ({ name, color, glass }) => {
    const worst = worstGlassContrast(glass, color, 'bar', color.accent, 'blurred');
    const lum = relativeLuminance(worst.backdrop);
    if (name === 'light') {
      expect(lum).toBeGreaterThan(0.05);
    } else {
      expect(lum).toBeLessThan(0.8);
    }
  });
});

describe('WCAG AA on glass (§106, §72)', () => {
  it.each(CASES)('every allowed ink meets 4.5:1 on every $name level over the $mode backdrop envelope', ({ color, glass, mode }) => {
    const failures = GLASS_LEVELS.flatMap((level) => failuresFor(glass, color, level, GLASS_INKS[level], mode));
    expect(failures).toEqual([]);
  });

  it.each(CASES)('pressed and selected lenses on $name bars keep their inks readable ($mode)', ({ color, glass, mode }) => {
    const failures = [
      ...failuresFor(glass, color, 'bar', GLASS_INKS.bar, mode, [glass.pressed]),
      ...failuresFor(glass, color, 'bar', ['accent'], mode, [glass.selection]),
      ...failuresFor(glass, color, 'bar', ['accent'], mode, [glass.selection, glass.pressed]),
    ];
    expect(failures).toEqual([]);
  });

  it('sets in-sheet content on a raised surface that stands apart from the dark sheet at 1.15:1 or more', () => {
    const sheet = compositeLayers([darkGlass.level.sheet.tint], compositeLayers([darkGlass.scrim.color], darkColors.background));
    expect(contrastOnLayers(darkColors.surfaceElevated, [], sheet)).toBeGreaterThanOrEqual(1.15);
    expect(contrastOnLayers(darkColors.surfaceElevated, [], darkGlass.level.sheet.opaque)).toBeGreaterThanOrEqual(1.15);
  });

  it('draws a scrim strong enough that the page behind a sheet reads as inactive', () => {
    expect(alphaOf(lightGlass.scrim.color)).toBeGreaterThanOrEqual(0.4);
    expect(alphaOf(darkGlass.scrim.color)).toBeGreaterThanOrEqual(0.55);
    for (const { glass } of SCHEMES) {
      expect(alphaOf(glass.scrim.reduced)).toBeGreaterThan(alphaOf(glass.scrim.color));
    }
  });

  it.each(SCHEMES)('outlines a selected segment in glass accent at 3:1 or more against the $name control track (WCAG 1.4.11)', ({ color, glass }) => {
    const ink = glassInkFor(glass, color, 'control', 'accent');
    expect(contrastOnLayers(ink, [], glass.level.control.opaque)).toBeGreaterThanOrEqual(3);
    expect(contrastOnLayers(ink, [glass.level.control.tint], color.background)).toBeGreaterThanOrEqual(3);
    expect(contrastOnLayers(ink, [glass.level.control.tint, glass.selection], color.background)).toBeGreaterThanOrEqual(3);
  });

  it('gives the selected lens a rim so selection reads by shape as well as colour (§78)', () => {
    for (const { glass } of SCHEMES) {
      expect(alphaOf(glass.selectionRim)).toBeGreaterThan(alphaOf(glass.selection) / 2);
    }
  });

  it('documents which inks are allowed per level and never allows textMuted on bars, docks or controls', () => {
    for (const level of ['bar', 'dock', 'control'] as const) {
      expect(GLASS_INKS[level]).not.toContain('textMuted');
    }
    expect(GLASS_INKS.sheet).toEqual(expect.arrayContaining([...TEXT_TOKENS]));
  });

  it.each(SCHEMES)('every text token meets 4.5:1 on the opaque $name twins used when transparency is reduced', ({ color, glass }) => {
    const failures: string[] = [];
    for (const level of GLASS_LEVELS) {
      const inks: readonly ColorToken[] = level === 'control' ? GLASS_INKS.control : TEXT_TOKENS;
      for (const ink of inks) {
        const ratio = contrastOnLayers(color[ink], [glass.level[level].opaque], '#000000');
        if (ratio < 4.5) {
          failures.push(`${level} ${ink}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(SCHEMES)('the $name ambient wash never pulls a text token below 4.5:1 on the screen background', ({ color, glass }) => {
    const failures: string[] = [];
    for (const ink of TEXT_TOKENS) {
      for (const layers of [[glass.ambient.primary], [glass.ambient.primary, glass.ambient.secondary]]) {
        const ratio = contrastOnLayers(color[ink], layers, color.background);
        if (ratio < 4.5) {
          failures.push(`${ink}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('keeps the ambient glows a whisper: the lit page stays within 1.1:1 of the plain page, fading to the same hue at zero', () => {
    for (const { color, glass } of SCHEMES) {
      const pairs: readonly [string, string][] = [
        [glass.ambient.primary, glass.ambient.primaryClear],
        [glass.ambient.secondary, glass.ambient.secondaryClear],
      ];
      for (const [tone, clear] of pairs) {
        const a = parseColor(tone);
        const b = parseColor(clear);
        expect(a.a).toBeGreaterThan(0);
        expect(b.a).toBe(0);
        expect([a.r, a.g, a.b]).toEqual([b.r, b.g, b.b]);
      }
      const lit = compositeLayers([glass.ambient.primary, glass.ambient.secondary], color.background);
      expect(contrastOnLayers(formatRgb(lit), [], color.background)).toBeLessThanOrEqual(1.1);
    }
  });

  it('lights the dark night-stadium page with the §107 glows: #0D3843 at 18% top-left and #08313A at 10% centre-right', () => {
    expect(darkGlass.ambient.primary).toBe('rgba(13,56,67,0.18)');
    expect(darkGlass.ambient.secondary).toBe('rgba(8,49,58,0.10)');
    expect(darkColors.background).toBe('#070E12');
    const ambient = parseColor(lightGlass.ambient.primary);
    expect(ambient.b).toBeGreaterThan(ambient.r);
    expect(ambient.a).toBeLessThanOrEqual(0.08);
  });
});

describe('glass in the theme', () => {
  it('exposes glass tokens on the theme, transparent by default', () => {
    const light = createTheme('light');
    expect(light.glass.reduced).toBe(false);
    expect(light.glass.level.bar).toEqual(lightGlass.level.bar);
    expect(light.glass.radius).toBe(glassRadius);
    expect(createTheme('dark').glass.level.sheet).toEqual(darkGlass.level.sheet);
  });

  it('reduces transparency when asked (system or in-app) and under high contrast, with stronger edges and scrim', () => {
    const reduced = createTheme('light', { highContrast: false, reducedMotion: false, boldText: false, reduceTransparency: true });
    expect(reduced.glass.reduced).toBe(true);
    expect(reduced.glass.opaqueEdge).toBe(lightColors.border);
    expect(parseColor(reduced.glass.scrim.color).a).toBeGreaterThan(parseColor(lightGlass.scrim.color).a);
    const contrast = createTheme('dark', { highContrast: true, reducedMotion: false, boldText: false });
    expect(contrast.glass.reduced).toBe(true);
    expect(contrast.glass.opaqueEdge).toBe(darkColors.borderStrong);
    expect(createTheme('light', { highContrast: false, reducedMotion: false, boldText: false })).not.toBe(reduced);
  });

  it.each(GLASS_LEVELS.map((level) => [level] as [GlassLevel]))('keeps the %s level separate per theme (dark is not an inversion)', (level) => {
    expect(lightGlass.level[level].tint).not.toBe(darkGlass.level[level].tint);
    expect(lightGlass.level[level].unblurred).not.toBe(darkGlass.level[level].unblurred);
  });
});

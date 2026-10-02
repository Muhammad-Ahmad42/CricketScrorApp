import { StyleSheet, type ViewStyle } from 'react-native';
import { bandCoverage, compositeLayers, contrastOnLayers, discCoverage, mixColors, parseColor, type MixSpace, type Rgba } from './contrast';
import type { ColorToken, ColorTokens } from './tokens';

export const GLASS_LEVELS = ['bar', 'dock', 'control', 'popover', 'sheet'] as const;

export type GlassLevel = (typeof GLASS_LEVELS)[number];

export type GlassBlurTint = 'light' | 'dark';

export interface GlassLevelTokens {
  readonly tint: string;
  readonly unblurred: string;
  readonly opaque: string;
  readonly blur: number;
  readonly sheen: boolean;
}

export interface GlassRimTokens {
  readonly color: string;
  readonly top: string;
  readonly width: number;
}

export interface GlassEdgeTokens {
  readonly color: string;
  readonly width: number;
}

export interface GlassSheenTokens {
  readonly from: string;
  readonly to: string;
  readonly extent: number;
}

export interface GlassAmbientTokens {
  readonly primary: string;
  readonly primaryClear: string;
  readonly secondary: string;
  readonly secondaryClear: string;
}

export interface GlassScrimTokens {
  readonly color: string;
  readonly reduced: string;
}

export interface GlassPalette {
  readonly blurTint: GlassBlurTint;
  readonly level: { readonly [K in GlassLevel]: GlassLevelTokens };
  readonly rim: GlassRimTokens;
  readonly edge: GlassEdgeTokens;
  readonly sheen: GlassSheenTokens;
  readonly selection: string;
  readonly selectionRim: string;
  readonly pressed: string;
  readonly scrim: GlassScrimTokens;
  readonly ambient: GlassAmbientTokens;
  readonly shadow: ViewStyle;
}

export const glassRadius = {
  control: 12,
  popover: 16,
  dialog: 22,
  sheet: 24,
  dock: 24,
  pill: 999,
} as const;

export type GlassRadiusToken = keyof typeof glassRadius;

export const GLASS_INKS: { readonly [K in GlassLevel]: readonly ColorToken[] } = {
  bar: ['textPrimary', 'textSecondary', 'accent', 'score'],
  dock: ['textPrimary', 'textSecondary', 'accent', 'score'],
  control: ['textPrimary', 'textSecondary', 'accent'],
  popover: ['textPrimary', 'textSecondary', 'accent', 'success', 'warning', 'danger', 'score'],
  sheet: ['textPrimary', 'textSecondary', 'textMuted', 'accent', 'success', 'warning', 'danger', 'score'],
};

export const lightGlass: GlassPalette = {
  blurTint: 'light',
  level: {
    bar: { tint: 'rgba(251,251,248,0.72)', unblurred: 'rgba(251,251,248,0.80)', opaque: '#FBFBF8', blur: 70, sheen: true },
    dock: { tint: 'rgba(251,251,248,0.72)', unblurred: 'rgba(251,251,248,0.80)', opaque: '#FBFBF8', blur: 70, sheen: true },
    control: { tint: 'rgba(238,236,229,0.78)', unblurred: 'rgba(238,236,229,0.85)', opaque: '#EEECE5', blur: 60, sheen: true },
    popover: { tint: 'rgba(251,251,248,0.84)', unblurred: 'rgba(251,251,248,0.89)', opaque: '#FBFBF8', blur: 70, sheen: true },
    sheet: { tint: 'rgba(251,251,248,0.92)', unblurred: 'rgba(251,251,248,0.94)', opaque: '#FBFBF8', blur: 80, sheen: true },
  },
  rim: { color: 'rgba(255,255,255,0.60)', top: 'rgba(255,255,255,0.90)', width: 1 },
  edge: { color: 'rgba(26,28,25,0.10)', width: StyleSheet.hairlineWidth },
  sheen: { from: 'rgba(255,255,255,0.45)', to: 'rgba(255,255,255,0)', extent: 0.6 },
  selection: 'rgba(226,236,228,0.72)',
  selectionRim: 'rgba(31,92,58,0.40)',
  pressed: 'rgba(224,227,221,0.60)',
  scrim: { color: 'rgba(17,19,16,0.32)', reduced: 'rgba(17,19,16,0.48)' },
  ambient: {
    primary: 'rgba(31,92,58,0.04)',
    primaryClear: 'rgba(31,92,58,0)',
    secondary: 'rgba(74,111,192,0.025)',
    secondaryClear: 'rgba(74,111,192,0)',
  },
  shadow: {
    shadowColor: '#0E1A13',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
};

export const darkGlass: GlassPalette = {
  blurTint: 'dark',
  level: {
    bar: { tint: 'rgba(16,24,29,0.79)', unblurred: 'rgba(16,24,29,0.87)', opaque: '#10181D', blur: 70, sheen: true },
    dock: { tint: 'rgba(16,24,29,0.79)', unblurred: 'rgba(16,24,29,0.87)', opaque: '#10181D', blur: 70, sheen: true },
    control: { tint: 'rgba(10,15,18,0.78)', unblurred: 'rgba(10,15,18,0.84)', opaque: '#0A0F12', blur: 60, sheen: true },
    popover: { tint: 'rgba(19,27,32,0.80)', unblurred: 'rgba(19,27,32,0.88)', opaque: '#131B20', blur: 70, sheen: false },
    sheet: { tint: 'rgba(19,26,31,0.72)', unblurred: 'rgba(19,26,31,0.82)', opaque: '#131A1F', blur: 80, sheen: false },
  },
  rim: { color: 'rgba(120,196,200,0.24)', top: 'rgba(140,214,214,0.46)', width: 1 },
  edge: { color: 'rgba(2,6,7,0.60)', width: StyleSheet.hairlineWidth },
  sheen: { from: 'rgba(150,214,214,0.05)', to: 'rgba(150,214,214,0)', extent: 0.6 },
  selection: 'rgba(6,20,13,0.36)',
  selectionRim: 'rgba(114,190,144,0.50)',
  pressed: 'rgba(4,10,11,0.30)',
  scrim: { color: 'rgba(3,8,9,0.56)', reduced: 'rgba(3,8,9,0.72)' },
  ambient: {
    primary: 'rgba(70,160,150,0.08)',
    primaryClear: 'rgba(70,160,150,0)',
    secondary: 'rgba(104,108,190,0.06)',
    secondaryClear: 'rgba(104,108,190,0)',
  },
  shadow: {},
};

export interface GlassTokens extends GlassPalette {
  readonly reduced: boolean;
  readonly opaqueEdge: string;
  readonly radius: typeof glassRadius;
}

export function glassTokensFor(palette: GlassPalette, color: ColorTokens, reduced: boolean, highContrast: boolean): GlassTokens {
  return {
    ...palette,
    reduced: reduced || highContrast,
    opaqueEdge: highContrast ? color.borderStrong : color.border,
    scrim: reduced || highContrast ? { color: palette.scrim.reduced, reduced: palette.scrim.reduced } : palette.scrim,
    radius: glassRadius,
  };
}

export function glassPaletteFor(scheme: 'light' | 'dark'): GlassPalette {
  return scheme === 'dark' ? darkGlass : lightGlass;
}

export const GLASS_BLUR_SIGMA_PER_UNIT = 0.2;

export function glassBlurSigma(blur: number): number {
  return Math.round(blur * GLASS_BLUR_SIGMA_PER_UNIT * 100) / 100;
}

export const GLASS_SCRIM_LEVELS: readonly GlassLevel[] = ['sheet'];

export type GlassBackdropMode = 'blurred' | 'unblurred';

export interface GlassBackdropModel {
  readonly fields: readonly ColorToken[];
  readonly blocks: readonly ColorToken[];
  readonly details: readonly ColorToken[];
  readonly blockExtent: number;
  readonly detailRadius: number;
  readonly extremes: readonly string[];
  readonly spaces: readonly MixSpace[];
}

export const GLASS_BACKDROP: GlassBackdropModel = {
  fields: ['background', 'surface', 'surfaceElevated', 'surfaceSunken', 'accentSubtle', 'successSubtle', 'warningSubtle', 'dangerSubtle', 'border', 'chartGrid'],
  blocks: ['accent', 'accentPressed', 'danger', 'chartSeries1', 'chartSeries2'],
  details: [
    'textPrimary',
    'score',
    'textSecondary',
    'textMuted',
    'accent',
    'success',
    'warning',
    'danger',
    'borderStrong',
    'focusRing',
    'onAccent',
    'onDanger',
    'chartSeries1',
    'chartSeries2',
  ],
  blockExtent: 56,
  detailRadius: 16,
  extremes: ['#FFFFFF', '#000000'],
  spaces: ['srgb', 'linear'],
};

export interface GlassCoverage {
  readonly sigma: number;
  readonly block: number;
  readonly detail: number;
}

export function glassCoverage(blur: number, model: GlassBackdropModel = GLASS_BACKDROP): GlassCoverage {
  const sigma = glassBlurSigma(blur);
  return { sigma, block: bandCoverage(model.blockExtent, sigma), detail: discCoverage(model.detailRadius, sigma) };
}

function blurredField(color: ColorTokens, field: Rgba, coverage: GlassCoverage, model: GlassBackdropModel): Rgba[] {
  const out: Rgba[] = [field];
  for (const space of model.spaces) {
    for (const block of model.blocks) {
      out.push(mixColors(field, color[block], coverage.block, space));
    }
    for (const detail of model.details) {
      out.push(mixColors(field, color[detail], coverage.detail, space));
    }
  }
  return out;
}

export function glassBackdrops(
  palette: GlassPalette,
  color: ColorTokens,
  level: GlassLevel,
  mode: GlassBackdropMode,
  model: GlassBackdropModel = GLASS_BACKDROP,
): Rgba[] {
  const fields = model.fields.map((token) => parseColor(color[token]));
  fields.push(compositeLayers([palette.ambient.primary, palette.ambient.secondary], color.background));
  let backdrops: Rgba[];
  if (mode === 'blurred') {
    const coverage = glassCoverage(palette.level[level].blur, model);
    backdrops = fields.flatMap((field) => blurredField(color, field, coverage, model));
  } else {
    const inks = [...model.blocks, ...model.details].map((token) => parseColor(color[token]));
    backdrops = [...model.extremes.map((value) => parseColor(value)), ...fields, ...inks];
  }
  if (GLASS_SCRIM_LEVELS.includes(level)) {
    return backdrops.map((backdrop) => compositeLayers([palette.scrim.color], backdrop));
  }
  return backdrops;
}

export function glassLayerStacks(palette: GlassPalette, level: GlassLevel, mode: GlassBackdropMode): readonly (readonly string[])[] {
  const tokens = palette.level[level];
  const base = mode === 'blurred' ? tokens.tint : tokens.unblurred;
  return tokens.sheen ? [[base], [base, palette.sheen.from]] : [[base]];
}

export interface GlassContrastCase {
  readonly ratio: number;
  readonly backdrop: Rgba;
  readonly layers: readonly string[];
}

export function worstGlassContrast(
  palette: GlassPalette,
  color: ColorTokens,
  level: GlassLevel,
  ink: string,
  mode: GlassBackdropMode,
  overlays: readonly string[] = [],
  model: GlassBackdropModel = GLASS_BACKDROP,
): GlassContrastCase {
  const backdrops = glassBackdrops(palette, color, level, mode, model);
  let worst: GlassContrastCase = { ratio: Number.POSITIVE_INFINITY, backdrop: backdrops[0], layers: [] };
  for (const stack of glassLayerStacks(palette, level, mode)) {
    const layers = [...stack, ...overlays];
    for (const backdrop of backdrops) {
      const ratio = contrastOnLayers(ink, layers, backdrop);
      if (ratio < worst.ratio) {
        worst = { ratio, backdrop, layers };
      }
    }
  }
  return worst;
}

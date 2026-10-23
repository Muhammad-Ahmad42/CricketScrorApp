import type { ViewStyle } from 'react-native';
import { bandCoverage, compositeLayers, contrastOnLayers, discCoverage, mixColors, parseColor, type MixSpace, type Rgba } from './contrast';
import type { ColorToken, ColorTokens } from './tokens';

export const GLASS_LEVELS = ['bar', 'dock', 'control', 'popover', 'sheet'] as const;

export type GlassLevel = (typeof GLASS_LEVELS)[number];

export type GlassBlurTint = 'light' | 'dark';

export interface GlassRimTokens {
  readonly color: string;
  readonly top: string;
  readonly left: string;
  readonly width: number;
}

export interface GlassLevelTokens {
  readonly tint: string;
  readonly unblurred: string;
  readonly opaque: string;
  readonly blur: number;
  readonly sheen: boolean;
  readonly rim?: GlassRimTokens;
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

export interface GlassInkTokens {
  readonly secondary: string;
  readonly accent: string;
}

export interface GlassScrimTokens {
  readonly color: string;
  readonly reduced: string;
}

export interface GlassLiquidTokens {
  readonly fill: string;
  readonly fillTop: number;
  readonly fillBottom: number;
  readonly edge: string;
  readonly edgeOpacity: number;
  readonly glow: string;
  readonly glowOpacity: number;
  readonly rim: string;
  readonly rimOpacity: number;
  readonly line: string;
  readonly lineOpacity: number;
  readonly ink: ColorToken;
}

export interface GlassPalette {
  readonly blurTint: GlassBlurTint;
  readonly level: { readonly [K in GlassLevel]: GlassLevelTokens };
  readonly rim: GlassRimTokens;
  readonly edge: GlassEdgeTokens;
  readonly sheen: GlassSheenTokens;
  readonly ink: GlassInkTokens;
  readonly rest: number;
  readonly saturation: number;
  readonly selection: string;
  readonly selectionRim: string;
  readonly pressed: string;
  readonly scrim: GlassScrimTokens;
  readonly ambient: GlassAmbientTokens;
  readonly liquid: GlassLiquidTokens;
  readonly fade: number;
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

export const GLASS_INK_LEVELS: readonly GlassLevel[] = ['bar', 'dock', 'control'];

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
    bar: { tint: 'rgba(252,254,255,0.60)', unblurred: 'rgba(252,254,255,0.98)', opaque: '#FCFEFF', blur: 100, sheen: true },
    dock: {
      tint: 'rgba(252,254,255,0.66)',
      unblurred: 'rgba(252,254,255,0.985)',
      opaque: '#FCFEFF',
      blur: 100,
      sheen: true,
      rim: { color: 'rgba(255,255,255,0.80)', top: 'rgba(255,255,255,0.94)', left: 'rgba(255,255,255,0.88)', width: 1 },
    },
    control: { tint: 'rgba(232,240,244,0.64)', unblurred: 'rgba(232,240,244,0.98)', opaque: '#E8F0F4', blur: 90, sheen: true },
    popover: { tint: 'rgba(252,254,255,0.86)', unblurred: 'rgba(252,254,255,0.985)', opaque: '#FCFEFF', blur: 100, sheen: true },
    sheet: { tint: 'rgba(252,254,255,0.88)', unblurred: 'rgba(252,254,255,0.99)', opaque: '#FCFEFF', blur: 100, sheen: true },
  },
  rim: { color: 'rgba(255,255,255,0.70)', top: 'rgba(255,255,255,0.92)', left: 'rgba(255,255,255,0.84)', width: 1 },
  edge: { color: 'rgba(0,139,163,0.30)', width: 1 },
  sheen: { from: 'rgba(255,255,255,0.65)', to: 'rgba(255,255,255,0)', extent: 0.45 },
  ink: { secondary: '#2F4954', accent: '#004D5A' },
  rest: 0.6,
  saturation: 1.7,
  selection: 'rgba(214,239,245,0.78)',
  selectionRim: 'rgba(0,96,111,0.55)',
  pressed: 'rgba(10,34,41,0.06)',
  scrim: { color: 'rgba(6,26,32,0.40)', reduced: 'rgba(6,26,32,0.52)' },
  ambient: {
    primary: 'rgba(0,194,224,0.07)',
    primaryClear: 'rgba(0,194,224,0)',
    secondary: 'rgba(255,255,255,0.60)',
    secondaryClear: 'rgba(255,255,255,0)',
  },
  liquid: {
    fill: '#0AA6C2',
    fillTop: 0.1,
    fillBottom: 0.26,
    edge: '#00606F',
    edgeOpacity: 0.3,
    glow: '#00C2E0',
    glowOpacity: 0.14,
    rim: '#00A9C7',
    rimOpacity: 0.75,
    line: '#008BA3',
    lineOpacity: 0.24,
    ink: 'accent',
  },
  fade: 0.5,
  shadow: {
    shadowColor: '#06222B',
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
};

export const darkGlass: GlassPalette = {
  blurTint: 'dark',
  level: {
    bar: { tint: 'rgba(15,27,34,0.70)', unblurred: 'rgba(15,27,34,0.98)', opaque: '#0F1B22', blur: 100, sheen: true },
    dock: {
      tint: 'rgba(15,27,34,0.76)',
      unblurred: 'rgba(15,27,34,0.985)',
      opaque: '#0F1B22',
      blur: 100,
      sheen: true,
      rim: { color: 'rgba(0,194,224,0.30)', top: 'rgba(40,217,242,0.50)', left: 'rgba(40,217,242,0.38)', width: 1 },
    },
    control: { tint: 'rgba(11,20,25,0.70)', unblurred: 'rgba(11,20,25,0.98)', opaque: '#0B1419', blur: 90, sheen: true },
    popover: { tint: 'rgba(17,30,37,0.90)', unblurred: 'rgba(17,30,37,0.985)', opaque: '#111E25', blur: 100, sheen: false },
    sheet: { tint: 'rgba(9,17,22,0.82)', unblurred: 'rgba(9,17,22,0.99)', opaque: '#091116', blur: 100, sheen: false },
  },
  rim: { color: 'rgba(0,194,224,0.20)', top: 'rgba(40,217,242,0.40)', left: 'rgba(40,217,242,0.30)', width: 1 },
  edge: { color: 'rgba(1,5,7,0.60)', width: 1 },
  sheen: { from: 'rgba(40,217,242,0.07)', to: 'rgba(40,217,242,0)', extent: 0.45 },
  ink: { secondary: '#ABBDC7', accent: '#26CCE6' },
  rest: 0.6,
  saturation: 1.6,
  selection: 'rgba(0,72,86,0.55)',
  selectionRim: 'rgba(0,194,224,0.50)',
  pressed: 'rgba(1,6,8,0.30)',
  scrim: { color: 'rgba(2,7,9,0.60)', reduced: 'rgba(2,7,9,0.76)' },
  ambient: {
    primary: 'rgba(13,56,67,0.18)',
    primaryClear: 'rgba(13,56,67,0)',
    secondary: 'rgba(8,49,58,0.10)',
    secondaryClear: 'rgba(8,49,58,0)',
  },
  liquid: {
    fill: '#00C2E0',
    fillTop: 0.12,
    fillBottom: 0.3,
    edge: '#28D9F2',
    edgeOpacity: 0.45,
    glow: '#00C2E0',
    glowOpacity: 0.16,
    rim: '#28D9F2',
    rimOpacity: 0.8,
    line: '#28D9F2',
    lineOpacity: 0.18,
    ink: 'textPrimary',
  },
  fade: 0.6,
  shadow: {},
};

export function glassRimFor(palette: GlassPalette, level: GlassLevel): GlassRimTokens {
  return palette.level[level].rim ?? palette.rim;
}

export function isGlassInkLevel(level: GlassLevel): boolean {
  return GLASS_INK_LEVELS.includes(level);
}

export function glassInkColors(palette: GlassPalette, color: ColorTokens, highContrast = false): ColorTokens {
  const secondary = highContrast ? color.textPrimary : palette.ink.secondary;
  return { ...color, textSecondary: secondary, textMuted: secondary, accent: palette.ink.accent };
}

export function glassInkFor(palette: GlassPalette, color: ColorTokens, level: GlassLevel, token: ColorToken): string {
  return isGlassInkLevel(level) ? glassInkColors(palette, color)[token] : color[token];
}

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

export const GLASS_BLUR_SIGMA_PER_UNIT = 0.24;

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
  blocks: ['accent', 'accentPressed', 'accentDeep', 'danger', 'chartSeries1', 'chartSeries2'],
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
    'highlight',
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

import type { FontFamilyKey } from './fonts';

export type NumericVariant = 'scoreHero' | 'scoreLarge' | 'scoreMedium' | 'scoreKey' | 'figure' | 'figureSmall';

export type UiVariant =
  | 'title1'
  | 'title2'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'label'
  | 'tableNumeric'
  | 'keyLabel';

export type TextVariant = NumericVariant | UiVariant;

export interface VariantSpec {
  readonly family: FontFamilyKey;
  readonly size: number;
  readonly lineHeight: number;
  readonly tracking: number;
  readonly uppercase: boolean;
  readonly tabular: boolean;
  readonly maxScale: number;
}

function spec(
  family: FontFamilyKey,
  size: number,
  lineHeight: number,
  tracking: number,
  maxScale: number,
  flags: { readonly uppercase?: boolean; readonly tabular?: boolean } = {},
): VariantSpec {
  return {
    family,
    size,
    lineHeight,
    tracking,
    maxScale,
    uppercase: flags.uppercase ?? false,
    tabular: flags.tabular ?? false,
  };
}

export const TEXT_VARIANTS: { readonly [K in TextVariant]: VariantSpec } = {
  scoreHero: spec('barlow600', 64, 64, -0.5, 1.0, { tabular: true }),
  scoreLarge: spec('barlow600', 40, 44, 0, 1.0, { tabular: true }),
  scoreMedium: spec('barlow600', 28, 32, 0, 1.3, { tabular: true }),
  scoreKey: spec('barlow600', 32, 36, 0, 1.2, { tabular: true }),
  figure: spec('barlow500', 22, 26, 0, 1.3, { tabular: true }),
  figureSmall: spec('barlow500', 17, 20, 0, 1.3, { tabular: true }),
  title1: spec('inter700', 28, 34, -0.3, 1.6),
  title2: spec('inter600', 22, 28, -0.2, 1.6),
  headline: spec('inter600', 17, 24, 0, 1.6),
  body: spec('inter400', 16, 24, 0, 2.0),
  bodyStrong: spec('inter600', 16, 24, 0, 2.0),
  callout: spec('inter400', 15, 22, 0, 2.0),
  subhead: spec('inter500', 14, 20, 0, 2.0),
  footnote: spec('inter400', 13, 18, 0, 2.0),
  label: spec('inter600', 12, 16, 0.8, 1.5, { uppercase: true }),
  tableNumeric: spec('inter500', 15, 20, 0, 1.5, { tabular: true }),
  keyLabel: spec('inter700', 15, 18, 0.8, 1.2, { uppercase: true }),
};

export const HERO_SIZES = {
  compact: { size: 52, lineHeight: 52 },
  regular: { size: 64, lineHeight: 64 },
  tablet: { size: 72, lineHeight: 72 },
} as const;

export type HeroSize = keyof typeof HERO_SIZES;

export const MIN_TEXT_SIZE = 12;

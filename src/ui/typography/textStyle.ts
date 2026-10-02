import type { TextStyle } from 'react-native';
import type { ColorToken, Theme } from '../theme';
import { bolderFamily, fontFamily, type FontFamilyKey } from './fonts';
import { TEXT_VARIANTS, type TextVariant } from './variants';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'score'
  | 'onAccent'
  | 'onDanger'
  | 'inverse'
  | 'inverseAccent';

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export const TONE_TOKEN: { readonly [K in TextTone]: ColorToken } = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  muted: 'textMuted',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  score: 'score',
  onAccent: 'onAccent',
  onDanger: 'onDanger',
  inverse: 'inverseText',
  inverseAccent: 'inverseAccent',
};

const INTER_WEIGHTS: { readonly [K in TextWeight]: FontFamilyKey } = {
  regular: 'inter400',
  medium: 'inter500',
  semibold: 'inter600',
  bold: 'inter700',
};

const BARLOW_WEIGHTS: { readonly [K in TextWeight]: FontFamilyKey } = {
  regular: 'barlow500',
  medium: 'barlow500',
  semibold: 'barlow600',
  bold: 'barlow700',
};

export interface TextStyleOptions {
  readonly tone?: TextTone;
  readonly weight?: TextWeight;
  readonly size?: number;
  readonly lineHeight?: number;
}

function familyFor(variant: TextVariant, weight: TextWeight | undefined, boldText: boolean): FontFamilyKey {
  const base = TEXT_VARIANTS[variant].family;
  const chosen = weight ? (base.startsWith('barlow') ? BARLOW_WEIGHTS : INTER_WEIGHTS)[weight] : base;
  return boldText ? bolderFamily(chosen) : chosen;
}

const styleCache = new WeakMap<Theme, Map<string, TextStyle>>();

export function textStyle(variant: TextVariant, theme: Theme, options: TextStyleOptions = {}): TextStyle {
  const key = `${variant}|${options.tone ?? ''}|${options.weight ?? ''}|${options.size ?? ''}|${options.lineHeight ?? ''}`;
  let perTheme = styleCache.get(theme);
  if (!perTheme) {
    perTheme = new Map();
    styleCache.set(theme, perTheme);
  }
  const cached = perTheme.get(key);
  if (cached) {
    return cached;
  }
  const style = buildTextStyle(variant, theme, options);
  perTheme.set(key, style);
  return style;
}

function buildTextStyle(variant: TextVariant, theme: Theme, options: TextStyleOptions): TextStyle {
  const spec = TEXT_VARIANTS[variant];
  const style: TextStyle = {
    fontFamily: fontFamily[familyFor(variant, options.weight, theme.boldText)],
    fontSize: options.size ?? spec.size,
    lineHeight: options.lineHeight ?? spec.lineHeight,
    letterSpacing: spec.tracking,
    color: theme.color[TONE_TOKEN[options.tone ?? 'primary']],
  };
  if (spec.uppercase) {
    style.textTransform = 'uppercase';
  }
  if (spec.tabular) {
    style.fontVariant = ['tabular-nums'];
  }
  return style;
}

export function maxScaleFor(variant: TextVariant): number {
  return TEXT_VARIANTS[variant].maxScale;
}

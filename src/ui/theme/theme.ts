import type { ViewStyle } from 'react-native';
import {
  borderWidth,
  darkColors,
  lightColors,
  lightShadow,
  motionDuration,
  radius,
  size,
  space,
  type ColorTokens,
} from './tokens';
import { glassPaletteFor, glassTokensFor, type GlassTokens } from './glass';

export type ColorScheme = 'light' | 'dark';
export type ThemeMode = 'light' | 'dark' | 'system';
export type ReducedMotionPreference = 'system' | 'on' | 'off';

export interface ThemeOptions {
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly boldText: boolean;
  readonly reduceTransparency?: boolean;
}

export interface ThemeMotion {
  readonly reduced: boolean;
  readonly duration: typeof motionDuration;
}

export interface ThemeElevation {
  readonly flat: ViewStyle;
  readonly raised: ViewStyle;
}

export interface Theme {
  readonly scheme: ColorScheme;
  readonly color: ColorTokens;
  readonly space: typeof space;
  readonly radius: typeof radius;
  readonly size: typeof size;
  readonly borderWidth: { readonly hairline: number; readonly control: number; readonly emphasis: number; readonly focus: number; readonly bar: number };
  readonly elevation: ThemeElevation;
  readonly motion: ThemeMotion;
  readonly highContrast: boolean;
  readonly boldText: boolean;
  readonly glass: GlassTokens;
}

export const DEFAULT_THEME_OPTIONS: ThemeOptions = {
  highContrast: false,
  reducedMotion: false,
  boldText: false,
  reduceTransparency: false,
};

function paletteFor(scheme: ColorScheme, highContrast: boolean): ColorTokens {
  const base = scheme === 'dark' ? darkColors : lightColors;
  if (!highContrast) {
    return base;
  }
  return {
    ...base,
    textSecondary: base.textPrimary,
    textMuted: base.textPrimary,
    border: base.borderStrong,
  };
}

function elevationFor(scheme: ColorScheme, color: ColorTokens): ThemeElevation {
  if (scheme === 'dark') {
    return {
      flat: {},
      raised: { borderTopWidth: borderWidth.control, borderTopColor: color.border },
    };
  }
  return { flat: {}, raised: { ...lightShadow } };
}

function buildTheme(scheme: ColorScheme, options: ThemeOptions): Theme {
  const color = paletteFor(scheme, options.highContrast);
  return {
    scheme,
    color,
    space,
    radius,
    size,
    borderWidth: {
      ...borderWidth,
      hairline: options.highContrast ? borderWidth.control : borderWidth.hairline,
    },
    elevation: elevationFor(scheme, color),
    motion: { reduced: options.reducedMotion, duration: motionDuration },
    highContrast: options.highContrast,
    boldText: options.boldText,
    glass: glassTokensFor(glassPaletteFor(scheme), color, options.reduceTransparency === true, options.highContrast),
  };
}

const cache = new Map<string, Theme>();

export function createTheme(scheme: ColorScheme, options: ThemeOptions = DEFAULT_THEME_OPTIONS): Theme {
  const key = `${scheme}|${options.highContrast ? 1 : 0}|${options.reducedMotion ? 1 : 0}|${options.boldText ? 1 : 0}|${options.reduceTransparency ? 1 : 0}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const theme = buildTheme(scheme, options);
  cache.set(key, theme);
  return theme;
}

export function resolveScheme(mode: ThemeMode, system: string | null | undefined): ColorScheme {
  if (mode === 'system') {
    return system === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

export function resolveReducedMotion(preference: ReducedMotionPreference, systemReduced: boolean): boolean {
  if (preference === 'on') {
    return true;
  }
  if (preference === 'off') {
    return false;
  }
  return systemReduced;
}

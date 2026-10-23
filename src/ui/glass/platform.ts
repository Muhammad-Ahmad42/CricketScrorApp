import { Platform, type ViewStyle } from 'react-native';
import type { BlurTint } from 'expo-blur';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { glassBlurSigma, useGlass, type GlassBlurTint, type GlassLevelTokens } from '../theme';
import { useBlurTarget } from './GlassBackdrop';

export type GlassRenderer = 'liquid' | 'blur' | 'unblurred' | 'opaque';

export interface GlassRendererInput {
  readonly os: string;
  readonly liquidAvailable: boolean;
  readonly reduced: boolean;
  readonly blurAvailable?: boolean;
}

export function resolveGlassRenderer({ os, liquidAvailable, reduced, blurAvailable = true }: GlassRendererInput): GlassRenderer {
  if (reduced) {
    return 'opaque';
  }
  if (os === 'ios' && liquidAvailable) {
    return 'liquid';
  }
  return blurAvailable ? 'blur' : 'unblurred';
}

export function stickyGlassScrollerStyle(os: string): ViewStyle | null {
  return os === 'web' ? { transform: 'none' } : null;
}

export const STICKY_GLASS_SCROLLER: ViewStyle | null = stickyGlassScrollerStyle(Platform.OS);

export const ANDROID_BLUR_MIN_API = 31;

export interface BackdropBlurInput {
  readonly os: string;
  readonly version?: string | number;
  readonly hasBlurTarget: boolean;
  readonly cssBackdropFilter?: boolean;
}

export function backdropBlurAvailable({ os, version, hasBlurTarget, cssBackdropFilter = true }: BackdropBlurInput): boolean {
  if (os === 'android') {
    return hasBlurTarget && Number(version) >= ANDROID_BLUR_MIN_API;
  }
  if (os === 'web') {
    return cssBackdropFilter;
  }
  return true;
}

interface CssSupports {
  readonly supports?: (property: string, value: string) => boolean;
}

export function cssBackdropFilterSupported(): boolean {
  const css = (globalThis as { readonly CSS?: CssSupports }).CSS;
  if (css === undefined || typeof css.supports !== 'function') {
    return false;
  }
  try {
    return css.supports('backdrop-filter', 'blur(1px)') || css.supports('-webkit-backdrop-filter', 'blur(1px)');
  } catch {
    return false;
  }
}

export interface BlurViewLook {
  readonly tint: BlurTint;
  readonly intensity: number;
  readonly blurReductionFactor?: number;
}

export const ANDROID_BLUR_REDUCTION = 2;

export function blurViewLook(os: string, blurTint: GlassBlurTint, blur: number): BlurViewLook {
  if (os === 'ios') {
    return { tint: blurTint === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight', intensity: blur };
  }
  const tint: BlurTint = blurTint === 'dark' ? 'systemUltraThinMaterialDark' : 'default';
  if (os === 'android') {
    return { tint, intensity: blur / ANDROID_BLUR_REDUCTION, blurReductionFactor: ANDROID_BLUR_REDUCTION };
  }
  return { tint, intensity: blur };
}

export const GLASS_SATURATION = 1.6;

export function webFrostFilter(blur: number, saturation: number = GLASS_SATURATION): string {
  return `saturate(${Math.round(saturation * 100)}%) blur(${glassBlurSigma(blur)}px)`;
}

export function webFrostStyle(blur: number, saturation: number = GLASS_SATURATION): ViewStyle {
  const filter = webFrostFilter(blur, saturation);
  return { backdropFilter: filter, WebkitBackdropFilter: filter } as ViewStyle;
}

export function glassTintFor(tokens: GlassLevelTokens, renderer: GlassRenderer, inline = false): string {
  if (renderer === 'opaque') {
    return tokens.opaque;
  }
  if (renderer === 'unblurred' && !inline) {
    return tokens.unblurred;
  }
  return tokens.tint;
}

export function liquidGlassAvailable(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

export function useGlassRenderer(): GlassRenderer {
  const glass = useGlass();
  const target = useBlurTarget();
  const blurAvailable = backdropBlurAvailable({
    os: Platform.OS,
    version: Platform.Version,
    hasBlurTarget: target !== undefined,
    cssBackdropFilter: Platform.OS === 'web' ? cssBackdropFilterSupported() : true,
  });
  return resolveGlassRenderer({ os: Platform.OS, liquidAvailable: liquidGlassAvailable(), reduced: glass.reduced, blurAvailable });
}

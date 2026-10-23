import { useWindowDimensions } from 'react-native';

export type WidthClass = 'compact-s' | 'compact' | 'medium' | 'expanded';
export type HeightClass = 'short' | 'regular' | 'tall';

export interface LayoutClass {
  readonly width: WidthClass;
  readonly height: HeightClass;
  readonly isLandscape: boolean;
  readonly largeText: boolean;
}

export const BREAKPOINTS = {
  compact: 360,
  medium: 600,
  expanded: 768,
  shortHeight: 600,
  tallHeight: 800,
  largeTextScale: 1.3,
} as const;

export const FONT_SCALE_EPSILON = 0.001;

export function isLargeText(fontScale: number): boolean {
  return fontScale + FONT_SCALE_EPSILON >= BREAKPOINTS.largeTextScale;
}

export function widthClassFor(width: number): WidthClass {
  if (width < BREAKPOINTS.compact) {
    return 'compact-s';
  }
  if (width < BREAKPOINTS.medium) {
    return 'compact';
  }
  if (width < BREAKPOINTS.expanded) {
    return 'medium';
  }
  return 'expanded';
}

export function heightClassFor(height: number): HeightClass {
  if (height < BREAKPOINTS.shortHeight) {
    return 'short';
  }
  if (height <= BREAKPOINTS.tallHeight) {
    return 'regular';
  }
  return 'tall';
}

export function layoutClassFor(width: number, height: number, fontScale = 1): LayoutClass {
  return {
    width: widthClassFor(width),
    height: heightClassFor(height),
    isLandscape: width > height,
    largeText: isLargeText(fontScale),
  };
}

export function useLayoutClass(): LayoutClass {
  const { width, height, fontScale } = useWindowDimensions();
  return layoutClassFor(width, height, fontScale);
}

export function scoringKeyHeight(width: number, height: number, tabletPane = false): number {
  if (tabletPane) {
    return 80;
  }
  if (width < 340 || height < 600) {
    return 56;
  }
  if (height < 667) {
    return 64;
  }
  return 72;
}

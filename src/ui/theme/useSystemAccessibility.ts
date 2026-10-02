import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export type SystemAccessibilityFlag = 'reduceMotion' | 'highContrast' | 'boldText' | 'reduceTransparency';

type FlagEvent = 'reduceMotionChanged' | 'darkerSystemColorsChanged' | 'highTextContrastChanged' | 'boldTextChanged' | 'reduceTransparencyChanged';

interface FlagSource {
  readonly query: () => Promise<boolean>;
  readonly event: FlagEvent;
}

interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

type MatchMedia = (query: string) => MediaQueryListLike;

export const REDUCED_TRANSPARENCY_MEDIA = '(prefers-reduced-transparency: reduce)';

function webMedia(query: string): MediaQueryListLike | null {
  const match = (globalThis as { matchMedia?: MatchMedia }).matchMedia;
  if (typeof match !== 'function') {
    return null;
  }
  try {
    return match(query);
  } catch {
    return null;
  }
}

function sourceFor(flag: SystemAccessibilityFlag): FlagSource | null {
  switch (flag) {
    case 'reduceMotion':
      return { query: () => AccessibilityInfo.isReduceMotionEnabled(), event: 'reduceMotionChanged' };
    case 'highContrast':
      if (Platform.OS === 'ios') {
        return { query: () => AccessibilityInfo.isDarkerSystemColorsEnabled(), event: 'darkerSystemColorsChanged' };
      }
      if (Platform.OS === 'android') {
        return { query: () => AccessibilityInfo.isHighTextContrastEnabled(), event: 'highTextContrastChanged' };
      }
      return null;
    case 'boldText':
      if (Platform.OS === 'ios') {
        return { query: () => AccessibilityInfo.isBoldTextEnabled(), event: 'boldTextChanged' };
      }
      return null;
    case 'reduceTransparency':
      if (Platform.OS === 'ios') {
        return { query: () => AccessibilityInfo.isReduceTransparencyEnabled(), event: 'reduceTransparencyChanged' };
      }
      return null;
    default: {
      const unreachable: never = flag;
      return unreachable;
    }
  }
}

function subscribeWebTransparency(setEnabled: (value: boolean) => void): () => void {
  const media = webMedia(REDUCED_TRANSPARENCY_MEDIA);
  if (!media) {
    return () => undefined;
  }
  setEnabled(media.matches === true);
  const listener = () => setEnabled(media.matches === true);
  media.addEventListener?.('change', listener);
  return () => media.removeEventListener?.('change', listener);
}

export function useSystemAccessibility(flag: SystemAccessibilityFlag): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (flag === 'reduceTransparency' && Platform.OS === 'web') {
      return subscribeWebTransparency(setEnabled);
    }
    const source = sourceFor(flag);
    if (!source) {
      return undefined;
    }
    let active = true;
    source
      .query()
      .then((value) => {
        if (active) {
          setEnabled(value === true);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(source.event, (value: boolean) => {
      if (active) {
        setEnabled(value === true);
      }
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [flag]);
  return enabled;
}

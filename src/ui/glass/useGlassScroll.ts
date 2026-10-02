import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export const GLASS_SCROLL_THRESHOLD = 2;
export const GLASS_SCROLL_THROTTLE = 16;

export type GlassScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

export interface GlassScroll {
  readonly scrolled: boolean;
  readonly onScroll: GlassScrollHandler;
  readonly scrollEventThrottle: number;
}

export function isScrolledUnder(offsetY: number, threshold: number = GLASS_SCROLL_THRESHOLD): boolean {
  return offsetY > threshold;
}

export function useGlassScroll(threshold: number = GLASS_SCROLL_THRESHOLD): GlassScroll {
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(false);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = isScrolledUnder(event.nativeEvent.contentOffset.y, threshold);
      if (next !== last.current) {
        last.current = next;
        setScrolled(next);
      }
    },
    [threshold],
  );
  return { scrolled, onScroll, scrollEventThrottle: GLASS_SCROLL_THROTTLE };
}

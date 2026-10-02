import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../theme';
import type { MotionDurationToken } from '../theme/tokens';
import { REDUCED_FADE_MS, timingFor, timingMs } from './easing';

export interface EntranceOptions {
  readonly visible?: boolean;
  readonly enter?: MotionDurationToken;
  readonly exit?: MotionDurationToken;
  readonly translateY?: number;
  readonly scale?: number;
  readonly delay?: number;
  readonly reducedFade?: boolean;
  readonly replayKey?: string | number;
}

export function useEntrance({
  visible = true,
  enter = 'base',
  exit = 'exit',
  translateY = 0,
  scale = 1,
  delay = 0,
  reducedFade = true,
  replayKey,
}: EntranceOptions = {}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced && !reducedFade && visible ? 1 : 0);

  useEffect(() => {
    const target = visible ? 1 : 0;
    if (reduced) {
      if (reducedFade) {
        progress.set(withTiming(target, timingMs(REDUCED_FADE_MS, 'fast')));
      } else {
        progress.set(target);
      }
      return;
    }
    if (replayKey !== undefined && visible) {
      progress.set(0);
    }
    const config = timingFor(visible ? enter : exit);
    progress.set(visible && delay > 0 ? withDelay(delay, withTiming(target, config)) : withTiming(target, config));
  }, [visible, reduced, reducedFade, enter, exit, delay, replayKey, progress]);

  return useAnimatedStyle(() => {
    const p = progress.get();
    if (reduced) {
      return { opacity: p, transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * translateY }, { scale: scale + (1 - scale) * p }],
    };
  });
}

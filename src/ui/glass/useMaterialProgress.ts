import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { timingFor } from '../motion/easing';
import { useReducedMotion } from '../theme';

export function materialOpacity(progress: number, rest: number): number {
  'worklet';
  const floor = Math.min(1, Math.max(0, rest));
  return floor + (1 - floor) * progress;
}

export function useMaterialProgress(active: boolean, rest = 0) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const target = active ? 1 : 0;
    progress.set(reduced ? target : withTiming(target, timingFor('fast')));
  }, [active, reduced, progress]);
  return useAnimatedStyle(() => ({ opacity: materialOpacity(progress.get(), rest) }));
}

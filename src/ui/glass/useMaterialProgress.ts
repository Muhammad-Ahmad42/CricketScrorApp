import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { timingFor } from '../motion/easing';
import { useReducedMotion } from '../theme';

export function useMaterialProgress(active: boolean) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const target = active ? 1 : 0;
    progress.set(reduced ? target : withTiming(target, timingFor('fast')));
  }, [active, reduced, progress]);
  return useAnimatedStyle(() => ({ opacity: progress.get() }));
}

import {
  Easing,
  ReduceMotion,
  type EasingFunction,
  type EasingFunctionFactory,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { motionDuration, type MotionDurationToken } from '../theme/tokens';

const STANDARD = Easing.bezier(0.2, 0, 0, 1);
const EXIT = Easing.bezier(0.3, 0, 1, 1);

export const motionEasing: { readonly [K in MotionDurationToken]: EasingFunction | EasingFunctionFactory } = {
  instant: Easing.linear,
  fast: Easing.out(Easing.cubic),
  base: STANDARD,
  slow: STANDARD,
  exit: EXIT,
};

export const REDUCED_FADE_MS = 120;

export function timingFor(token: MotionDurationToken): WithTimingConfig {
  return { duration: motionDuration[token], easing: motionEasing[token], reduceMotion: ReduceMotion.Never };
}

export function timingMs(duration: number, token: MotionDurationToken = 'base'): WithTimingConfig {
  return { duration, easing: motionEasing[token], reduceMotion: ReduceMotion.Never };
}

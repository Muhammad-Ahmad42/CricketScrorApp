import { useEffect, useState } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { timingMs } from '../motion/easing';
import { space, useTheme } from '../theme';

export const SKELETON_DELAY_MS = 300;
export const SKELETON_PULSE_MS = 1200;

export interface SkeletonBlock {
  readonly width: DimensionValue;
  readonly height: number;
}

export const SKELETON_ROW: readonly SkeletonBlock[] = [
  { width: '60%', height: 16 },
  { width: '40%', height: 12 },
];

export interface SkeletonProps {
  readonly rows?: number;
  readonly blocks?: readonly SkeletonBlock[];
  readonly rowHeight?: number;
  readonly delayMs?: number;
  readonly testID?: string;
}

export function Skeleton({ rows = 3, blocks = SKELETON_ROW, rowHeight = 56, delayMs = SKELETON_DELAY_MS, testID }: SkeletonProps) {
  const theme = useTheme();
  const reduced = theme.motion.reduced;
  const [shown, setShown] = useState(delayMs <= 0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (shown) {
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [shown, delayMs]);

  useEffect(() => {
    if (!shown || reduced) {
      cancelAnimation(opacity);
      opacity.set(1);
      return undefined;
    }
    const half = SKELETON_PULSE_MS / 2;
    opacity.set(withRepeat(withSequence(withTiming(0.55, timingMs(half)), withTiming(1, timingMs(half))), -1));
    return () => cancelAnimation(opacity);
  }, [shown, reduced, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={styles.root}
    >
      {shown
        ? Array.from({ length: rows }, (_, index) => (
            <Animated.View key={index} style={[styles.row, { minHeight: rowHeight }, pulse]}>
              {blocks.map((block, blockIndex) => (
                <View
                  key={blockIndex}
                  style={{
                    width: block.width,
                    height: block.height,
                    backgroundColor: theme.color.surfaceSunken,
                    borderRadius: theme.radius.xs,
                  }}
                />
              ))}
            </Animated.View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  row: { justifyContent: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.sm },
});

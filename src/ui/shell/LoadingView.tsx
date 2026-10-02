import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { timingMs } from '../motion/easing';
import { space, useTheme } from '../theme';
import { Text } from '../typography';

export const PROGRESS_RULE_WIDTH = 120;
const SWEEP_MS = 1200;

export interface LoadingViewProps {
  readonly title?: string;
  readonly message?: string;
  readonly testID?: string;
}

export function LoadingView({ title = 'Scorebook', message = 'Preparing your matches…', testID = 'bootstrap-loading' }: LoadingViewProps) {
  const theme = useTheme();
  const reduced = theme.motion.reduced;
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(sweep);
      sweep.set(0);
      return undefined;
    }
    sweep.set(withRepeat(withTiming(1, timingMs(SWEEP_MS, 'base')), -1));
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);

  const segment = useAnimatedStyle(() => ({
    transform: [{ translateX: (sweep.get() * 1.5 - 0.5) * PROGRESS_RULE_WIDTH }],
  }));

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: theme.color.background }]}
      accessible
      accessibilityLabel={`${title}. ${message}`}
      accessibilityState={{ busy: true }}
    >
      <View style={styles.spacer} />
      <Text variant="title1" align="center">
        {title}
      </Text>
      <Text variant="footnote" tone="secondary" align="center">
        {message}
      </Text>
      {reduced ? null : (
        <View testID={`${testID}-progress`} style={[styles.track, { backgroundColor: theme.color.border }]}>
          <Animated.View style={[styles.segment, { backgroundColor: theme.color.accent }, segment]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', gap: space.xs, paddingHorizontal: space.md },
  spacer: { flex: 0.4 },
  track: { width: PROGRESS_RULE_WIDTH, height: 2, overflow: 'hidden', marginTop: space.sm },
  segment: { width: PROGRESS_RULE_WIDTH / 2, height: 2 },
});

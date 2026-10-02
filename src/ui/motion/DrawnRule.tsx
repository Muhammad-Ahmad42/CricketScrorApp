import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme, type ColorToken } from '../theme';
import { motionDuration } from '../theme/tokens';
import { timingFor, timingMs } from './easing';

export const FLASH_HOLD_MS = 300;

export interface DrawnRuleProps {
  readonly trigger: string | number | null;
  readonly color?: ColorToken;
  readonly thickness?: number;
  readonly mode?: 'flash' | 'persist';
  readonly delay?: number;
  readonly testID?: string;
}

export function DrawnRule({ trigger, color = 'danger', thickness = 2, mode = 'flash', delay = 0, testID }: DrawnRuleProps) {
  const theme = useTheme();
  const reduced = theme.motion.reduced;
  const draw = useSharedValue(mode === 'persist' && trigger !== null && reduced ? 1 : 0);
  const fade = useSharedValue(mode === 'persist' && trigger !== null ? 1 : 0);

  useEffect(() => {
    if (trigger === null) {
      draw.set(0);
      fade.set(0);
      return;
    }
    const show = withTiming(1, { duration: 0 });
    if (reduced) {
      draw.set(withTiming(1, { duration: 0 }));
      fade.set(mode === 'flash' ? withSequence(show, withDelay(motionDuration.slow + FLASH_HOLD_MS, withTiming(0, { duration: 0 }))) : show);
      return;
    }
    draw.set(withSequence(withTiming(0, { duration: 0 }), withDelay(delay, withTiming(1, timingFor('slow')))));
    fade.set(
      mode === 'flash'
        ? withSequence(show, withDelay(delay + motionDuration.slow + FLASH_HOLD_MS, withTiming(0, timingMs(motionDuration.exit, 'exit'))))
        : show,
    );
  }, [trigger, reduced, mode, delay, draw, fade]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [{ scaleX: draw.get() }],
  }));

  return (
    <View
      testID={testID}
      style={[styles.track, { height: thickness }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={[styles.line, { backgroundColor: theme.color[color] }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: 'stretch', overflow: 'hidden' },
  line: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, transformOrigin: 'left' },
});

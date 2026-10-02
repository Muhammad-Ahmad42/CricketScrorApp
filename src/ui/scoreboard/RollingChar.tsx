import { memo, useEffect, useState } from 'react';
import { Text as RNText, StyleSheet, View, type TextStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { timingFor } from '../motion/easing';
import { motionDuration } from '../theme/tokens';

export const SIX_TINT_HOLD_MS = 400;
export const ROLL_OFFSET = 8;
const SETTLE_MS = 16;

export interface RollingCharProps {
  readonly char: string;
  readonly style: TextStyle;
  readonly baseColor: string;
  readonly accentColor: string;
  readonly flash: boolean;
  readonly reduced: boolean;
  readonly lineHeight: number;
  readonly maxFontSizeMultiplier: number;
}

interface Slot {
  readonly current: string;
  readonly previous: string | null;
  readonly generation: number;
  readonly animating: boolean;
  readonly flash: boolean;
}

export function rollLifetimeMs(reduced: boolean, flash: boolean): number {
  const roll = reduced ? 0 : motionDuration.base;
  const tint = flash ? SIX_TINT_HOLD_MS + (reduced ? 0 : motionDuration.base) : 0;
  return Math.max(roll, tint) + SETTLE_MS;
}

interface AnimatedRollProps {
  readonly current: string;
  readonly previous: string | null;
  readonly style: TextStyle;
  readonly baseColor: string;
  readonly accentColor: string;
  readonly flash: boolean;
  readonly reduced: boolean;
  readonly maxFontSizeMultiplier: number;
}

function AnimatedRoll({ current, previous, style, baseColor, accentColor, flash, reduced, maxFontSizeMultiplier }: AnimatedRollProps) {
  const roll = useSharedValue(reduced ? 1 : 0);
  const tint = useSharedValue(flash ? 1 : 0);

  useEffect(() => {
    if (!reduced) {
      roll.set(withTiming(1, timingFor('base')));
    }
    if (flash) {
      tint.set(withDelay(SIX_TINT_HOLD_MS, reduced ? withTiming(0, { duration: 0 }) : withTiming(0, timingFor('base'))));
    }
  }, [reduced, flash, roll, tint]);

  const incoming = useAnimatedStyle(() => {
    const p = roll.get();
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * ROLL_OFFSET }],
      color: interpolateColor(tint.get(), [0, 1], [baseColor, accentColor]),
    };
  });

  const outgoing = useAnimatedStyle(() => {
    const p = roll.get();
    return { opacity: 1 - p, transform: [{ translateY: -p * ROLL_OFFSET }] };
  });

  return (
    <>
      {previous !== null ? (
        <Animated.Text style={[style, styles.outgoing, { color: baseColor }, outgoing]} maxFontSizeMultiplier={maxFontSizeMultiplier} accessible={false}>
          {previous}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[style, incoming]} maxFontSizeMultiplier={maxFontSizeMultiplier} accessible={false}>
        {current}
      </Animated.Text>
    </>
  );
}

function RollingCharComponent({ char, style, baseColor, accentColor, flash, reduced, lineHeight, maxFontSizeMultiplier }: RollingCharProps) {
  const [slot, setSlot] = useState<Slot>({ current: char, previous: null, generation: 0, animating: false, flash: false });

  if (slot.current !== char) {
    setSlot({
      current: char,
      previous: reduced ? null : slot.current,
      generation: slot.generation + 1,
      animating: !reduced || flash,
      flash,
    });
  }

  useEffect(() => {
    if (!slot.animating) {
      return undefined;
    }
    const generation = slot.generation;
    const timer = setTimeout(() => {
      setSlot((prev) => (prev.generation === generation ? { ...prev, previous: null, animating: false, flash: false } : prev));
    }, rollLifetimeMs(reduced, slot.flash));
    return () => clearTimeout(timer);
  }, [slot.generation, slot.animating, slot.flash, reduced]);

  return (
    <View style={[styles.slot, { height: lineHeight }]}>
      {slot.animating ? (
        <AnimatedRoll
          key={slot.generation}
          current={slot.current}
          previous={slot.previous}
          style={style}
          baseColor={baseColor}
          accentColor={accentColor}
          flash={slot.flash}
          reduced={reduced}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        />
      ) : (
        <RNText style={[style, { color: baseColor }]} maxFontSizeMultiplier={maxFontSizeMultiplier} accessible={false}>
          {slot.current}
        </RNText>
      )}
    </View>
  );
}

export const RollingChar = memo(RollingCharComponent);

const styles = StyleSheet.create({
  slot: { overflow: 'hidden', justifyContent: 'center' },
  outgoing: { position: 'absolute', left: 0, right: 0 },
});

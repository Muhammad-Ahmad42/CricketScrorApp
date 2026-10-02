import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { timingFor, timingMs } from '../motion/easing';
import { focusRingStyle, useFocusRing } from '../primitives/internal/interaction';
import { useTheme, type Theme } from '../theme';
import { Text, textStyle } from '../typography';
import {
  ballChipLook,
  CHIP_DIMENSIONS,
  chipAccessibilityLabel,
  chipEntrance,
  chipRadius,
  splitShortRun,
  type BallChipKind,
  type BallChipLook,
  type BallChipSize,
} from './ballChipLook';

export interface BallChipProps {
  readonly text: string;
  readonly kind: BallChipKind;
  readonly isFreeHit?: boolean;
  readonly size?: BallChipSize;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly animateIn?: boolean;
  readonly onPress?: () => void;
  readonly testID?: string;
}

function chipStyle(theme: Theme, look: BallChipLook, size: BallChipSize): ViewStyle {
  const dims = CHIP_DIMENSIONS[size];
  const round = look.shape === 'circle';
  return {
    height: dims.size,
    minWidth: dims.size,
    width: round ? dims.size : undefined,
    paddingHorizontal: round ? 0 : dims.paddingX,
    borderRadius: chipRadius(look.shape, dims.size),
    backgroundColor: look.fill ? theme.color[look.fill] : 'transparent',
    borderWidth: look.borderWidth,
    borderColor: look.border ? theme.color[look.border] : 'transparent',
    borderStyle: look.dashed ? 'dashed' : 'solid',
  };
}

interface ChipFaceProps {
  readonly text: string;
  readonly look: BallChipLook;
  readonly size: BallChipSize;
}

function ChipFace({ text, look, size }: ChipFaceProps) {
  const theme = useTheme();
  const dims = CHIP_DIMENSIONS[size];
  const split = splitShortRun(text);
  const numeric = textStyle('figureSmall', theme, { tone: 'primary', weight: look.weight, size: dims.font, lineHeight: dims.lineHeight });
  const inkColor = theme.color[look.text];
  return (
    <Text style={[numeric, { color: inkColor }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
      {split.main}
      {split.suffix ? (
        <Text style={[numeric, { color: inkColor, fontSize: Math.round(dims.font * 0.7), lineHeight: dims.lineHeight }]}>{split.suffix}</Text>
      ) : null}
    </Text>
  );
}

function EnteringChip({ text, look, size, kind }: ChipFaceProps & { readonly kind: BallChipKind }) {
  const theme = useTheme();
  const dims = CHIP_DIMENSIONS[size];
  const motion = chipEntrance(kind);
  const enter = useSharedValue(0);
  const ring = useSharedValue(motion.entrance === 'boundary' ? 1 : 0);

  useEffect(() => {
    enter.set(withTiming(1, timingFor(motion.entrance === 'fade' ? 'fast' : 'base')));
    if (motion.entrance === 'boundary') {
      ring.set(withTiming(0, timingMs(motion.ringMs, 'base')));
    }
  }, [motion.entrance, motion.ringMs, enter, ring]);

  const bodyStyle = useAnimatedStyle(() => {
    const p = enter.get();
    if (motion.entrance === 'fade') {
      return { opacity: p, transform: [{ scale: 1 }] };
    }
    return { opacity: p === 0 ? 0 : 1, transform: [{ scale: 0.85 + 0.15 * p }] };
  });

  const ringStyle = useAnimatedStyle(() => {
    const r = ring.get();
    return { opacity: 0.6 * r, transform: [{ scale: 1 + (motion.ringScale - 1) * (1 - r) }] };
  });

  return (
    <>
      {motion.entrance === 'boundary' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: dims.size / 2, borderWidth: theme.borderWidth.emphasis, borderColor: theme.color.accent },
            ringStyle,
          ]}
        />
      ) : null}
      <Animated.View style={[styles.chip, chipStyle(theme, look, size), bodyStyle]}>
        <ChipFace text={text} look={look} size={size} />
      </Animated.View>
    </>
  );
}

function BallChipComponent({
  text,
  kind,
  isFreeHit = false,
  size = 'lg',
  accessibilityLabel,
  accessibilityHint,
  animateIn = false,
  onPress,
  testID,
}: BallChipProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const look = ballChipLook(kind);
  const animate = animateIn && !theme.motion.reduced;
  const label = chipAccessibilityLabel(text, accessibilityLabel, isFreeHit);

  const chip = (
    <View style={styles.column}>
      <View style={styles.anchor}>
        {animate ? (
          <EnteringChip text={text} look={look} size={size} kind={kind} />
        ) : (
          <View style={[styles.chip, chipStyle(theme, look, size)]}>
            <ChipFace text={text} look={look} size={size} />
          </View>
        )}
      </View>
      {isFreeHit ? <View testID={testID ? `${testID}-free-hit` : undefined} style={[styles.freeHit, { backgroundColor: theme.color.warning }]} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        style={[styles.pressable, { borderRadius: theme.radius.md }, focusRingStyle(theme, focus.focused, 'inside')]}
      >
        {chip}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={label}>
      {chip}
    </View>
  );
}

export const BallChip = memo(BallChipComponent);

export interface BallPlaceholderProps {
  readonly size?: BallChipSize;
  readonly testID?: string;
}

export function BallPlaceholder({ size = 'lg', testID }: BallPlaceholderProps) {
  const theme = useTheme();
  const dims = CHIP_DIMENSIONS[size];
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no"
      accessibilityElementsHidden
      style={{
        width: dims.size,
        height: dims.size,
        borderRadius: dims.size / 2,
        borderWidth: 1,
        borderStyle: 'dotted',
        borderColor: theme.color.border,
      }}
    />
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'stretch' },
  anchor: { alignSelf: 'flex-start' },
  chip: { alignItems: 'center', justifyContent: 'center' },
  freeHit: { height: 2, marginTop: 2 },
  pressable: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

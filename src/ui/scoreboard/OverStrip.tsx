import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { REDUCED_FADE_MS, timingFor, timingMs } from '../motion/easing';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { BallChip, BallPlaceholder } from './BallChip';
import type { BallChipKind, BallChipSize } from './ballChipLook';

export interface OverBall {
  readonly text: string;
  readonly kind: BallChipKind;
  readonly isFreeHit: boolean;
  readonly accessibilityLabel: string;
}

export interface OverStripProps {
  readonly balls: readonly OverBall[];
  readonly remaining: number;
  readonly label?: string | null;
  readonly summary?: string | null;
  readonly runs?: string | null;
  readonly runsLabel?: string;
  readonly overKey?: string | number;
  readonly size?: BallChipSize;
  readonly animateLatest?: boolean;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly chipTestID?: (position: number) => string;
}

export function overStripAccessibilityLabel(
  label: string | null | undefined,
  balls: readonly OverBall[],
  remaining: number,
  runs: string | null | undefined,
): string {
  const heading = label ? `${label.charAt(0)}${label.slice(1).toLowerCase()}` : 'This over';
  const deliveries = balls.length > 0 ? balls.map((ball) => chipLabel(ball)).join(', ') : 'no balls yet';
  const parts = [`${heading}: ${deliveries}.`];
  if (remaining > 0) {
    parts.push(`${remaining} ${remaining === 1 ? 'ball' : 'balls'} left.`);
  }
  if (runs) {
    parts.push(`${runs} ${runs === '1' ? 'run' : 'runs'}.`);
  }
  return parts.join(' ');
}

function chipLabel(ball: OverBall): string {
  return ball.isFreeHit ? `${ball.accessibilityLabel}, free hit` : ball.accessibilityLabel;
}

export function OverStrip({
  balls,
  remaining,
  label = 'THIS OVER',
  summary,
  runs,
  runsLabel = 'RUNS',
  overKey,
  size = 'lg',
  animateLatest = true,
  accessibilityLabel,
  testID = 'score-row-over',
  chipTestID = (position) => `score-chip-ball-${position}`,
}: OverStripProps) {
  const theme = useTheme();
  const reduced = theme.motion.reduced;
  const scroll = useRef<ScrollView>(null);
  const slide = useSharedValue(1);
  const width = useSharedValue(0);
  const firstKey = useRef(overKey);

  useEffect(() => {
    if (overKey === undefined || overKey === firstKey.current) {
      return;
    }
    firstKey.current = overKey;
    slide.set(0);
    slide.set(withTiming(1, reduced ? timingMs(REDUCED_FADE_MS, 'fast') : timingFor('slow')));
  }, [overKey, reduced, slide]);

  const slideStyle = useAnimatedStyle(() => {
    const p = slide.get();
    if (reduced) {
      return { opacity: p, transform: [{ translateX: 0 }] };
    }
    return { opacity: 1, transform: [{ translateX: (1 - p) * width.get() }] };
  });

  const placeholders = Math.max(0, remaining);
  const heading = summary ?? label;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? overStripAccessibilityLabel(label, balls, placeholders, runs)}
      style={styles.root}
      onLayout={(event) => width.set(event.nativeEvent.layout.width)}
    >
      {heading ? (
        <View style={styles.header}>
          <Text variant={summary ? 'footnote' : 'label'} tone="secondary" numberOfLines={1} style={styles.headingText}>
            {heading}
          </Text>
          {runs !== undefined && runs !== null ? (
            <View style={styles.runs}>
              <Text variant="label" tone="secondary">
                {runsLabel}
              </Text>
              <Text variant="figureSmall">{runs}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.stripRow}>
        <Animated.View style={[styles.stripClip, slideStyle]}>
          <ScrollView
            ref={scroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: !reduced })}
          >
            {balls.map((ball, index) => (
              <BallChip
                key={`${index}-${ball.text}`}
                text={ball.text}
                kind={ball.kind}
                isFreeHit={ball.isFreeHit}
                accessibilityLabel={ball.accessibilityLabel}
                size={size}
                animateIn={animateLatest && index === balls.length - 1}
                testID={chipTestID(index + 1)}
              />
            ))}
            {Array.from({ length: placeholders }, (_, index) => (
              <BallPlaceholder key={`slot-${index}`} size={size} />
            ))}
          </ScrollView>
        </Animated.View>
        {heading ? null : runs !== undefined && runs !== null ? (
          <Text variant="figureSmall" style={styles.inlineRuns}>
            {runs}
          </Text>
        ) : null}
        <View style={[styles.edge, { width: theme.borderWidth.hairline, backgroundColor: theme.color.border }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', paddingHorizontal: space.md, paddingVertical: space.xs, gap: space.xxs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  headingText: { flexShrink: 1 },
  runs: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  stripRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  stripClip: { flex: 1, overflow: 'hidden' },
  chips: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  inlineRuns: { marginLeft: space.sm },
  edge: { alignSelf: 'stretch' },
});

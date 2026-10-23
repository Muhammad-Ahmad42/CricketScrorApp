import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GlassSurface } from '../glass/GlassSurface';
import { ChromeFade, LiquidLayer } from '../glass/LiquidLayer';
import { useKeyboardOverlap } from '../layout/keyboard';
import { BREAKPOINTS } from '../layout/layoutClass';
import { useInsets } from '../layout/useInsets';
import { Icon, type IconName } from '../primitives/Icon';
import { focusRingStyle, useFocusRing } from '../primitives/internal/interaction';
import { PRESSED_OPACITY } from '../primitives/Pressables';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { LIQUID_CENTER_Y, LIQUID_DEPTH, LIQUID_ICON_SIZE, inkCoverage, liquidGeometry, liquidHalfWidth, liquidPaths } from './liquid';

export interface TabBarItem {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  readonly testID?: string;
}

export interface TabBarProps {
  readonly items: readonly TabBarItem[];
  readonly bottomInset?: number;
  readonly onSelectionChange?: () => void;
}

export const TAB_BAR_HEIGHT = 56;
export const TAB_BAR_TOP = space.xxs;
export const TAB_BAR_PADDING = TAB_BAR_TOP;
export const TAB_BAR_MAX_WIDTH = 520;
export const TAB_ICON_SIZE = LIQUID_ICON_SIZE;
export const TAB_ICON_TOP = LIQUID_CENTER_Y - TAB_BAR_TOP - TAB_ICON_SIZE / 2;
export const TAB_LABEL_GAP = space.xxs;
export const TAB_LABEL_MAX_SCALE = 1.5;
export const TAB_BAR_FADE = space.xl;
export const TAB_BAR_GAP = TAB_BAR_FADE;
export const TAB_BAR_TEST_ID = 'tab-bar';
export const LIQUID_TEST_ID = 'tab-bar-liquid';
export const POCKET_TEST_ID = 'tab-bar-pocket';
export const TAB_EDGE_TEST_ID = 'tab-bar-edge';

export const LIQUID_HEAD_TIMING: WithTimingConfig = { duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), reduceMotion: ReduceMotion.Never };
export const LIQUID_TAIL_TIMING: WithTimingConfig = { duration: 460, easing: Easing.bezier(0.65, 0, 0.35, 1), reduceMotion: ReduceMotion.Never };

export interface TabBarMetrics {
  readonly height: number;
  readonly bottom: number;
  readonly side: number;
  readonly footprint: number;
}

export type FloatingTabBarMetrics = TabBarMetrics;

export function tabBarMetrics(bottomInset: number, windowWidth?: number): TabBarMetrics {
  const width = windowWidth ?? BREAKPOINTS.compact;
  const height = TAB_BAR_TOP + TAB_BAR_HEIGHT;
  const bottom = bottomInset > 0 ? bottomInset : space.xs;
  const side = width < BREAKPOINTS.compact ? space.xs : space.md;
  return { height, bottom, side, footprint: height + bottom };
}

export const floatingTabBarMetrics = tabBarMetrics;

export function tabBarTucked(os: string, keyboard: number): boolean {
  return os === 'android' && keyboard > 0;
}

interface TabSlot {
  readonly x: number;
  readonly width: number;
}

export function slotCenter(slot: TabSlot | null | undefined, offset?: number): number | null {
  return slot === null || slot === undefined ? null : (offset ?? 0) + slot.x + slot.width / 2;
}

export function tabPressedStyle(pressed: boolean, selected: boolean): { readonly opacity: number } | null {
  return pressed && !selected ? { opacity: PRESSED_OPACITY } : null;
}

export function narrowestSlot(slots: readonly (TabSlot | null)[]): number {
  const widths = slots.flatMap((slot) => (slot === null ? [] : [slot.width]));
  return widths.length === 0 ? 0 : Math.min(...widths);
}

interface TabBarButtonProps {
  readonly item: TabBarItem;
  readonly position: string;
  readonly center: number | null;
  readonly reach: number;
  readonly head: SharedValue<number>;
  readonly tail: SharedValue<number>;
  readonly onLayout: (event: LayoutChangeEvent) => void;
}

function TabBarButton({ item, position, center, reach, head, tail, onLayout }: TabBarButtonProps) {
  const theme = useTheme();
  const focus = useFocusRing();
  const fallback = item.selected ? 1 : 0;
  const lit = useAnimatedStyle(() => ({ opacity: center === null ? fallback : inkCoverage(head.get(), tail.get(), center, reach) }), [center, fallback, reach]);
  const plain = useAnimatedStyle(() => ({ opacity: center === null ? 1 - fallback : 1 - inkCoverage(head.get(), tail.get(), center, reach) }), [center, fallback, reach]);
  const litCaption = useAnimatedStyle(() => ({ opacity: center === null ? fallback : inkCoverage(head.get(), tail.get(), center, reach) }), [center, fallback, reach]);
  const plainCaption = useAnimatedStyle(() => ({ opacity: center === null ? 1 - fallback : 1 - inkCoverage(head.get(), tail.get(), center, reach) }), [center, fallback, reach]);
  const caption = {
    variant: 'label',
    maxFontSizeMultiplier: TAB_LABEL_MAX_SCALE,
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.8,
    ellipsizeMode: 'clip',
  } as const;
  return (
    <Pressable
      testID={item.testID}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityHint={position}
      accessibilityState={{ selected: item.selected }}
      aria-selected={item.selected}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      onLayout={onLayout}
      style={({ pressed }) => [
        styles.item,
        { borderRadius: theme.glass.radius.popover },
        tabPressedStyle(pressed, item.selected),
        focusRingStyle(theme, focus.focused, 'inside'),
      ]}
    >
      <View style={styles.iconSlot}>
        <Animated.View style={[styles.iconLayer, plain]}>
          <Icon name={item.icon} size={TAB_ICON_SIZE} color="textSecondary" />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, lit]} testID={item.testID ? `${item.testID}-lit` : undefined}>
          <Icon name={item.icon} size={TAB_ICON_SIZE} color={theme.glass.liquid.ink} testID={item.testID ? `${item.testID}-lit-icon` : undefined} />
        </Animated.View>
      </View>
      <View>
        <Animated.View style={litCaption} testID={item.testID ? `${item.testID}-caption-lit` : undefined}>
          <Text {...caption} weight="semibold" style={[styles.caption, { color: theme.color.accent }]}>
            {item.label}
          </Text>
        </Animated.View>
        <Animated.View
          style={[styles.captionLayer, plainCaption]}
          testID={item.testID ? `${item.testID}-caption-plain` : undefined}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text {...caption} weight="medium" align="center" style={[styles.caption, { color: theme.color.textSecondary }]}>
            {item.label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function sameSlots(a: readonly (TabSlot | null)[], b: readonly (TabSlot | null)[]): boolean {
  return a.length === b.length && a.every((slot, index) => slot?.x === b[index]?.x && slot?.width === b[index]?.width);
}

interface LiquidCanvasProps {
  readonly width: number;
  readonly height: number;
  readonly halfWidth: number;
  readonly head: SharedValue<number>;
  readonly tail: SharedValue<number>;
}

function LiquidCanvas({ width, height, halfWidth, head, tail }: LiquidCanvasProps) {
  const paths = useDerivedValue(() => liquidPaths(head.get(), tail.get(), liquidGeometry(width, height, halfWidth)), [width, height, halfWidth]);
  return <LiquidLayer width={width} height={height} depth={LIQUID_DEPTH} paths={paths} testID={LIQUID_TEST_ID} shapeTestID={POCKET_TEST_ID} lineTestID={TAB_EDGE_TEST_ID} />;
}

interface BarFrame {
  readonly width: number;
  readonly rowX: number;
}

export function TabBar({ items, bottomInset, onSelectionChange }: TabBarProps) {
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const keyboard = useKeyboardOverlap();
  const metrics = tabBarMetrics(bottomInset ?? insets.bottom, window.width);
  const tucked = tabBarTucked(Platform.OS, keyboard);
  const reduced = theme.motion.reduced;
  const [frame, setFrame] = useState<BarFrame>({ width: 0, rowX: 0 });
  const [slots, setSlots] = useState<readonly (TabSlot | null)[]>(() => items.map(() => null));
  const head = useSharedValue(Number.NaN);
  const tail = useSharedValue(Number.NaN);
  const [ready, setReady] = useState(false);
  const [rest, setRest] = useState(0);
  const selectedIndex = items.findIndex((item) => item.selected);
  const halfWidth = liquidHalfWidth(narrowestSlot(slots));
  const target = selectedIndex >= 0 && frame.width > 0 ? slotCenter(slots[selectedIndex], frame.rowX) : null;
  const previous = useRef(selectedIndex);
  const settled = useRef(selectedIndex);
  const feedback = useRef(onSelectionChange);

  useEffect(() => {
    feedback.current = onSelectionChange;
  });

  useEffect(() => {
    if (previous.current !== selectedIndex) {
      previous.current = selectedIndex;
      if (selectedIndex >= 0) {
        feedback.current?.();
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (target === null) {
      return;
    }
    const moved = settled.current !== selectedIndex;
    settled.current = selectedIndex;
    const settle = () => setRest((count) => count + 1);
    if (reduced || !moved || !Number.isFinite(head.get()) || !Number.isFinite(tail.get())) {
      head.set(target);
      tail.set(target);
      setReady(true);
      if (moved) {
        settle();
      }
      return;
    }
    head.set(withTiming(target, LIQUID_HEAD_TIMING));
    tail.set(
      withTiming(target, LIQUID_TAIL_TIMING, (finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(settle);
        }
      }),
    );
  }, [target, selectedIndex, reduced, head, tail]);

  const measureSlot = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width: slotWidth } = event.nativeEvent.layout;
    setSlots((current) => {
      const next = items.map((_, i) => (i === index ? { x, width: slotWidth } : (current[i] ?? null)));
      return sameSlots(current, next) ? current : next;
    });
  };

  const measureSurface = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setFrame((current) => (current.width === width ? current : { ...current, width }));
  };

  const measureRow = (event: LayoutChangeEvent) => {
    const rowX = event.nativeEvent.layout.x;
    setFrame((current) => (current.rowX === rowX ? current : { ...current, rowX }));
  };

  const canvas: ReactNode = frame.width > 0 && ready ? <LiquidCanvas key={rest} width={frame.width} height={metrics.height} halfWidth={halfWidth} head={head} tail={tail} /> : null;

  return (
    <View
      pointerEvents={tucked ? 'none' : 'box-none'}
      accessibilityElementsHidden={tucked}
      importantForAccessibility={tucked ? 'no-hide-descendants' : 'auto'}
      testID={TAB_BAR_TEST_ID}
      style={[styles.dock, tucked ? styles.tucked : null]}
    >
      <ChromeFade height={TAB_BAR_FADE} />
      <GlassSurface
        level="bar"
        rim={theme.glass.reduced ? 'top' : 'none'}
        onLayout={measureSurface}
        style={{
          paddingTop: TAB_BAR_TOP,
          paddingBottom: metrics.bottom,
          paddingHorizontal: metrics.side + Math.max(insets.left, insets.right),
        }}
      >
        {canvas}
        <View accessibilityRole="tablist" onLayout={measureRow} style={styles.row}>
          {items.map((item, index) => (
            <TabBarButton
              key={item.key}
              item={item}
              position={`${index + 1} of ${items.length}`}
              center={frame.width > 0 ? slotCenter(slots[index], frame.rowX) : null}
              reach={halfWidth}
              head={head}
              tail={tail}
              onLayout={measureSlot(index)}
            />
          ))}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  tucked: { opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'center', width: '100%', maxWidth: TAB_BAR_MAX_WIDTH, height: TAB_BAR_HEIGHT },
  item: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 44,
    minHeight: 44,
    height: TAB_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: space.xxs,
  },
  iconSlot: { marginTop: TAB_ICON_TOP, marginBottom: TAB_LABEL_GAP, width: TAB_ICON_SIZE, height: TAB_ICON_SIZE },
  iconLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  caption: { textTransform: 'none', letterSpacing: 0 },
  captionLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center' },
});

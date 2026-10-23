import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type Text as RNText,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GlassMaterial } from '../glass/GlassMaterial';
import { useMeasuredHeight } from '../glass/useMeasuredHeight';
import { GutterProvider, RowBleedProvider, SHEET_GUTTER } from '../layout/gutter';
import { KeyboardScopeProvider, useKeyboardOverlap, useKeyboardReveal } from '../layout/keyboard';
import { BREAKPOINTS } from '../layout/layoutClass';
import { useInsets } from '../layout/useInsets';
import { REDUCED_FADE_MS, timingFor, timingMs } from '../motion/easing';
import { SurfaceLevelScope, space, useTheme } from '../theme';
import { motionDuration } from '../theme/tokens';
import { Text } from '../typography';
import { moveAccessibilityFocus } from './internal/accessibilityFocus';
import { OverlayReadyProvider, useOverlaySettled } from './internal/overlayReady';
import { IconButton } from './IconButton';

export interface SheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly subtitle?: string;
  readonly onClose?: () => void;
  readonly blocking?: boolean;
  readonly footer?: ReactNode;
  readonly scrollable?: boolean;
  readonly closeLabel?: string;
  readonly leading?: ReactNode;
  readonly testID?: string;
  readonly children: ReactNode;
}

export const SWIPE_DISMISS_RATIO = 0.3;
const MAX_HEIGHT_RATIO = 0.9;
export const SHEET_MAX_WIDTH = 560;
export const SIDE_SHEET_WIDTH = 420;

export type SheetPresentation = 'bottom' | 'floating' | 'side';

export function sheetPresentation(width: number, height: number): SheetPresentation {
  if (width < BREAKPOINTS.medium) {
    return 'bottom';
  }
  if (width >= BREAKPOINTS.expanded && width > height) {
    return 'side';
  }
  return 'floating';
}

export function shouldDismissOnRelease(dy: number, sheetHeight: number): boolean {
  return sheetHeight > 0 && dy > sheetHeight * SWIPE_DISMISS_RATIO;
}

export function sheetMaxHeight(windowHeight: number, keyboard: number, topInset: number): number {
  const resting = windowHeight * MAX_HEIGHT_RATIO;
  if (keyboard <= 0) {
    return resting;
  }
  return Math.max(0, Math.min(resting, windowHeight - keyboard - topInset - space.md));
}

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  blocking = false,
  footer,
  scrollable = true,
  closeLabel = 'Close',
  leading,
  testID,
  children,
}: SheetProps) {
  const theme = useTheme();
  const insets = useInsets();
  const window = useWindowDimensions();
  const reduced = theme.motion.reduced;
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(window.height);
  const titleRef = useRef<RNText>(null);
  const dismissible = !blocking && onClose !== undefined;
  const presentation = sheetPresentation(window.width, window.height);
  const side = presentation === 'side';
  const travel = side ? Math.min(SIDE_SHEET_WIDTH, window.width - space.md * 2) + space.md : 0;
  const keyboard = useKeyboardOverlap();
  const scrollRef = useRef<ScrollView>(null);
  const [footerHeight, onFooterLayout] = useMeasuredHeight();
  const keyboardReveal = useKeyboardReveal({
    scrollRef,
    enabled: scrollable,
    overlap: keyboard,
    visibleTop: insets.top,
    obscuredBottom: keyboard + (footer ? (footerHeight ?? 0) : 0),
    animated: !reduced,
  });
  const onBodyScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    keyboardReveal.trackScroll(event.nativeEvent.contentOffset.y);
  };
  const safeBottom = keyboard > 0 ? 0 : insets.bottom;
  const settled = useOverlaySettled(visible && mounted, reduced ? REDUCED_FADE_MS : motionDuration.base);

  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    drag.set(0);
    if (visible) {
      progress.set(withTiming(1, reduced ? timingMs(REDUCED_FADE_MS, 'fast') : timingFor('base')));
      const focusTimer = setTimeout(() => {
        if (titleRef.current) {
          moveAccessibilityFocus(titleRef.current);
        }
      }, 0);
      return () => clearTimeout(focusTimer);
    }
    const exitMs = reduced ? REDUCED_FADE_MS : motionDuration.exit;
    progress.set(withTiming(0, reduced ? timingMs(REDUCED_FADE_MS, 'fast') : timingFor('exit')));
    const unmountTimer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(unmountTimer);
  }, [visible, reduced, progress, drag]);

  const dismissRef = useRef(() => {});
  useEffect(() => {
    dismissRef.current = () => {
      if (dismissible) {
        onClose?.();
      } else {
        drag.set(withTiming(0, timingFor('fast')));
      }
    };
  }, [dismissible, onClose, drag]);

  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        drag.set(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (shouldDismissOnRelease(gesture.dy, height.get())) {
          dismissRef.current();
        } else {
          drag.set(withTiming(0, timingFor('fast')));
        }
      },
      onPanResponderTerminate: () => {
        drag.set(withTiming(0, timingFor('fast')));
      },
    }),
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const containerStyle = useAnimatedStyle(() => {
    const p = progress.get();
    if (reduced) {
      return { opacity: p, transform: [{ translateY: drag.get() }] };
    }
    if (side) {
      return { opacity: 1, transform: [{ translateX: (1 - p) * travel }] };
    }
    return { opacity: 1, transform: [{ translateY: (1 - p) * height.get() + drag.get() }] };
  });

  if (!mounted) {
    return null;
  }

  const onLayout = (event: LayoutChangeEvent) => {
    height.set(event.nativeEvent.layout.height);
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        if (dismissible) {
          onClose?.();
        }
      }}
    >
      <View testID={testID ? `${testID}-keyboard` : undefined} style={[styles.fill, { paddingBottom: keyboard }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.scrim.color }, scrimStyle]}>
          <Pressable
            testID={testID ? `${testID}-scrim` : undefined}
            style={styles.fill}
            onPress={dismissible ? onClose : undefined}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>
        <View style={side ? styles.sideAnchor : styles.anchor} pointerEvents="box-none">
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onLayout={onLayout}
            style={[
              styles.container,
              presentation === 'bottom'
                ? {
                    maxHeight: sheetMaxHeight(window.height, keyboard, insets.top),
                    borderTopLeftRadius: theme.glass.radius.sheet,
                    borderTopRightRadius: theme.glass.radius.sheet,
                  }
                : null,
              presentation === 'floating'
                ? {
                    alignSelf: 'center',
                    width: '100%',
                    maxWidth: SHEET_MAX_WIDTH,
                    maxHeight: sheetMaxHeight(window.height, keyboard, insets.top) - space.md - safeBottom,
                    marginBottom: space.md + safeBottom,
                    borderRadius: theme.glass.radius.sheet,
                  }
                : null,
              side
                ? {
                    width: Math.min(SIDE_SHEET_WIDTH, window.width - space.md * 2),
                    marginTop: space.md + insets.top,
                    marginBottom: space.md + safeBottom,
                    marginRight: space.md + insets.right,
                    alignSelf: 'stretch',
                    borderRadius: theme.glass.radius.sheet,
                  }
                : null,
              presentation === 'bottom' ? null : theme.glass.shadow,
              containerStyle,
            ]}
          >
            <GlassMaterial
              level="sheet"
              corners={presentation === 'bottom' ? 'top' : 'all'}
              radius={theme.glass.radius.sheet}
              testID={testID ? `${testID}-glass` : undefined}
            />
            <View {...(dismissible && !side ? pan.panHandlers : {})}>
              {side ? (
                <View style={styles.sideTop} />
              ) : (
                <View style={styles.grabberRow} accessible={false} importantForAccessibility="no-hide-descendants">
                  <View style={[styles.grabber, { backgroundColor: theme.color.borderStrong, borderRadius: theme.radius.xs }]} />
                </View>
              )}
              <View style={styles.header}>
                {leading ? <View style={styles.leading}>{leading}</View> : null}
                <View style={styles.headerText}>
                  <Text ref={titleRef} variant="headline" accessibilityRole="header" numberOfLines={2}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text variant="footnote" tone="secondary">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {dismissible ? (
                  <IconButton
                    icon="x"
                    accessibilityLabel={closeLabel}
                    onPress={() => onClose?.()}
                    testID={testID ? `${testID}-btn-close` : undefined}
                  />
                ) : null}
              </View>
            </View>
            <GutterProvider value={SHEET_GUTTER}>
              <KeyboardScopeProvider value={keyboardReveal.scope}>
                <OverlayReadyProvider ready={settled}>
                <SurfaceLevelScope level="raised">
                  <RowBleedProvider value={SHEET_GUTTER}>
                  {scrollable ? (
                    <ScrollView
                      ref={scrollRef}
                      testID={testID ? `${testID}-body` : undefined}
                      style={side ? styles.sideBody : styles.body}
                      contentContainerStyle={styles.bodyContent}
                      keyboardShouldPersistTaps="handled"
                      onScroll={onBodyScroll}
                      scrollEventThrottle={16}
                    >
                      {children}
                    </ScrollView>
                  ) : (
                    <View style={[styles.bodyContent, side ? styles.sideBody : null]}>{children}</View>
                  )}
                  </RowBleedProvider>
                </SurfaceLevelScope>
                </OverlayReadyProvider>
                {footer ? (
                  <View
                    testID={testID ? `${testID}-footer` : undefined}
                    onLayout={onFooterLayout}
                    style={[
                      styles.footer,
                      {
                        borderTopWidth: theme.borderWidth.hairline,
                        borderTopColor: theme.color.border,
                        paddingBottom: space.md + (presentation === 'bottom' ? safeBottom : 0),
                      },
                    ]}
                  >
                    {footer}
                  </View>
                ) : (
                  <View style={{ height: presentation === 'bottom' ? safeBottom : space.xs }} />
                )}
              </KeyboardScopeProvider>
            </GutterProvider>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sideAnchor: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  container: { alignSelf: 'stretch', overflow: 'hidden' },
  grabberRow: { alignItems: 'center', paddingTop: space.xs },
  grabber: { width: 36, height: 4 },
  sideTop: { height: space.xs },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    paddingRight: space.xxs,
    gap: space.xs,
  },
  headerText: { flex: 1 },
  leading: { marginLeft: -space.sm },
  body: { flexGrow: 0 },
  sideBody: { flex: 1 },
  bodyContent: { padding: space.md },
  footer: { paddingTop: space.md, paddingHorizontal: space.md, gap: space.xs },
});

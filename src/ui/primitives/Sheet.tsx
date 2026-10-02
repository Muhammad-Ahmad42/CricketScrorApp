import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type Text as RNText,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GlassMaterial } from '../glass/GlassMaterial';
import { useInsets } from '../layout/useInsets';
import { REDUCED_FADE_MS, timingFor, timingMs } from '../motion/easing';
import { space, useTheme } from '../theme';
import { motionDuration } from '../theme/tokens';
import { Text } from '../typography';
import { moveAccessibilityFocus } from './internal/accessibilityFocus';
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
  readonly testID?: string;
  readonly children: ReactNode;
}

export const SWIPE_DISMISS_RATIO = 0.3;
const MAX_HEIGHT_RATIO = 0.9;

export function shouldDismissOnRelease(dy: number, sheetHeight: number): boolean {
  return sheetHeight > 0 && dy > sheetHeight * SWIPE_DISMISS_RATIO;
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.scrim.color }, scrimStyle]}>
          <Pressable
            testID={testID ? `${testID}-scrim` : undefined}
            style={styles.fill}
            onPress={dismissible ? onClose : undefined}
            accessible={false}
            importantForAccessibility="no"
          />
        </Animated.View>
        <View style={styles.anchor} pointerEvents="box-none">
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onLayout={onLayout}
            style={[
              styles.container,
              {
                maxHeight: window.height * MAX_HEIGHT_RATIO,
                borderTopLeftRadius: theme.glass.radius.sheet,
                borderTopRightRadius: theme.glass.radius.sheet,
              },
              containerStyle,
            ]}
          >
            <GlassMaterial level="sheet" corners="top" radius={theme.glass.radius.sheet} testID={testID ? `${testID}-glass` : undefined} />
            <View {...(dismissible ? pan.panHandlers : {})}>
              <View style={styles.grabberRow} accessible={false} importantForAccessibility="no-hide-descendants">
                <View style={[styles.grabber, { backgroundColor: theme.color.borderStrong, borderRadius: theme.radius.xs }]} />
              </View>
              <View style={styles.header}>
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
            {scrollable ? (
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={styles.bodyContent}>{children}</View>
            )}
            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    borderTopWidth: theme.borderWidth.hairline,
                    borderTopColor: theme.color.border,
                    paddingBottom: space.md + insets.bottom,
                  },
                ]}
              >
                {footer}
              </View>
            ) : (
              <View style={{ height: insets.bottom }} />
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  container: { alignSelf: 'stretch', overflow: 'hidden' },
  grabberRow: { alignItems: 'center', paddingTop: space.xs },
  grabber: { width: 36, height: 4 },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    paddingRight: space.xxs,
    gap: space.xs,
  },
  headerText: { flex: 1 },
  body: { flexGrow: 0 },
  bodyContent: { padding: space.md },
  footer: { paddingTop: space.md, paddingHorizontal: space.md, gap: space.xs },
});

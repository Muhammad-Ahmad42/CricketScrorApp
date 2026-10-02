import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type Text as RNText,
  type View as RNView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { GlassMaterial } from '../glass/GlassMaterial';
import { REDUCED_FADE_MS } from '../motion/easing';
import { useEntrance } from '../motion/useEntrance';
import { space, useTheme } from '../theme';
import { motionDuration } from '../theme/tokens';
import { Text } from '../typography';
import { moveAccessibilityFocus } from './internal/accessibilityFocus';
import { Button } from './Button';

export interface DialogAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

export interface DialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly children?: ReactNode;
  readonly confirm: DialogAction;
  readonly cancel?: DialogAction;
  readonly destructive?: boolean;
  readonly onRequestClose?: () => void;
  readonly testID?: string;
  readonly messageTestID?: string;
}

export const STACK_LABEL_LENGTH = 18;
export const STACK_FONT_SCALE = 1.3;

export function shouldStackActions(labels: readonly string[], fontScale: number): boolean {
  return fontScale > STACK_FONT_SCALE || labels.some((label) => label.length > STACK_LABEL_LENGTH);
}

export function Dialog({
  visible,
  title,
  message,
  children,
  confirm,
  cancel,
  destructive = false,
  onRequestClose,
  testID = 'dialog-confirm',
  messageTestID = 'dialog-text-message',
}: DialogProps) {
  const theme = useTheme();
  const window = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const titleRef = useRef<RNText>(null);
  const cancelRef = useRef<RNView>(null);
  const entrance = useEntrance({ visible, enter: 'fast', exit: 'exit', scale: 0.98 });
  const scrim = useEntrance({ visible, enter: 'fast', exit: 'exit' });

  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      const focusTimer = setTimeout(() => {
        const target = destructive && cancelRef.current ? cancelRef.current : titleRef.current;
        if (target) {
          moveAccessibilityFocus(target);
        }
      }, 0);
      return () => clearTimeout(focusTimer);
    }
    const unmountTimer = setTimeout(() => setMounted(false), theme.motion.reduced ? REDUCED_FADE_MS : motionDuration.exit);
    return () => clearTimeout(unmountTimer);
  }, [visible, destructive, theme.motion.reduced]);

  if (!mounted) {
    return null;
  }

  const labels = cancel ? [cancel.label, confirm.label] : [confirm.label];
  const stacked = shouldStackActions(labels, window.fontScale);
  const width = Math.min(400, window.width - space['4xl']);
  const cancelButton = cancel ? (
    <View style={stacked ? styles.stackedItem : null}>
      <Button
        ref={cancelRef}
        label={cancel.label}
        onPress={cancel.onPress}
        variant="secondary"
        disabled={cancel.disabled}
        fullWidth={stacked}
        testID={cancel.testID ?? 'dialog-btn-cancel'}
      />
    </View>
  ) : null;
  const confirmButton = (
    <View style={stacked ? styles.stackedItem : null}>
      <Button
        label={confirm.label}
        onPress={confirm.onPress}
        variant={destructive ? 'destructiveConfirm' : 'primary'}
        loading={confirm.loading}
        disabled={confirm.disabled}
        fullWidth={stacked}
        testID={confirm.testID ?? 'dialog-btn-confirm'}
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onRequestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.center}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.scrim.color }, scrim]}
            accessible={false}
            importantForAccessibility="no"
          />
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            style={[styles.card, { width, borderRadius: theme.glass.radius.dialog }, theme.glass.shadow, entrance]}
          >
            <GlassMaterial level="sheet" radius={theme.glass.radius.dialog} testID={`${testID}-glass`} />
            <Text ref={titleRef} variant="title2" accessibilityRole="header">
              {title}
            </Text>
            {message ? (
              <Text variant="body" tone="secondary" testID={messageTestID}>
                {message}
              </Text>
            ) : null}
            {children}
            <View style={stacked ? styles.actionsStacked : styles.actionsRow}>
              {cancelButton}
              {confirmButton}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { padding: space.xl, gap: space.md },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.xs, marginTop: space.xs },
  actionsStacked: { gap: space.xs, marginTop: space.xs },
  stackedItem: { alignSelf: 'stretch' },
});

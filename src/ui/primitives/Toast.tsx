import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { GlassMaterial } from '../glass/GlassMaterial';
import { useActiveToastAnchor, type ToastAnchor } from '../layout/toastAnchor';
import { useInsets } from '../layout/useInsets';
import { useEntrance } from '../motion/useEntrance';
import { space, useTheme } from '../theme';
import { Text } from '../typography';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
  readonly action: { readonly label: string; readonly run: () => void } | null;
}

export const TOAST_DURATION_MS = { plain: 4000, withAction: 6000 } as const;

const TOAST_ICONS: { readonly [K in ToastKind]: IconName } = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  error: 'circle-alert',
};

export function toastDurationMs(toast: Pick<ToastMessage, 'kind' | 'action'>): number | null {
  if (toast.kind === 'error') {
    return null;
  }
  return toast.action ? TOAST_DURATION_MS.withAction : TOAST_DURATION_MS.plain;
}

export interface ToastProps {
  readonly toast: ToastMessage;
  readonly onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const theme = useTheme();
  const entrance = useEntrance({ enter: 'fast', translateY: 8, replayKey: toast.id });
  const assertive = toast.kind === 'error';

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(toast.message);
    }
  }, [toast.id, toast.message]);

  return (
    <Animated.View
      testID="toast"
      accessibilityRole={assertive ? 'alert' : 'text'}
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={[styles.toast, { borderRadius: theme.glass.radius.popover }, theme.glass.shadow, entrance]}
    >
      <GlassMaterial level="popover" radius={theme.glass.radius.popover} testID="toast-glass" />
      <Icon name={TOAST_ICONS[toast.kind]} size={20} color="textPrimary" />
      <Text variant="subhead" style={[styles.message, { color: theme.color.textPrimary }]} testID="toast-text">
        {toast.message}
      </Text>
      {toast.action ? (
        <Button
          label={toast.action.label}
          variant="tertiary"
          size="sm"
          testID="toast-btn-action"
          onPress={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
        />
      ) : null}
      {assertive ? (
        <IconButton
          icon="x"
          accessibilityLabel="Dismiss message"
          testID="toast-btn-dismiss"
          onPress={() => onDismiss(toast.id)}
        />
      ) : null}
    </Animated.View>
  );
}

export interface ToastHostProps {
  readonly toasts: readonly ToastMessage[];
  readonly onDismiss: (id: string) => void;
  readonly placement?: 'top' | 'bottom';
  readonly offset?: number;
}

export function toastHostEdge(
  placement: 'top' | 'bottom' | undefined,
  offset: number | undefined,
  anchor: ToastAnchor | null,
  safeBottom: number,
): { readonly top: number } | { readonly bottom: number } {
  if (placement === undefined && offset === undefined && anchor !== null) {
    return anchor.edge === 'top' ? { top: anchor.offset } : { bottom: anchor.offset };
  }
  const gap = offset ?? space.md;
  return placement === 'top' ? { top: gap } : { bottom: gap + safeBottom };
}

export function ToastHost({ toasts, onDismiss, placement, offset }: ToastHostProps) {
  const insets = useInsets();
  const anchor = useActiveToastAnchor();
  const current = toasts.length > 0 ? toasts[0] : null;
  const currentId = current?.id;
  const duration = current ? toastDurationMs(current) : null;

  useEffect(() => {
    if (currentId === undefined || duration === null) {
      return undefined;
    }
    const timer = setTimeout(() => onDismiss(currentId), duration);
    return () => clearTimeout(timer);
  }, [currentId, duration, onDismiss]);

  if (!current) {
    return null;
  }
  const edge = toastHostEdge(placement, offset, anchor, insets.bottom);
  return (
    <View pointerEvents="box-none" style={[styles.host, edge]} testID="toast-host">
      <Toast key={current.id} toast={current} onDismiss={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.md, right: space.md },
  toast: {
    minHeight: 48,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  message: { flex: 1 },
});

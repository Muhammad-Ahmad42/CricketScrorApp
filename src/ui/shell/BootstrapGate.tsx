import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ErrorState } from '../primitives/ErrorState';
import { useTheme } from '../theme';
import { LoadingView } from './LoadingView';
import { useSplashRelease } from './splash';

export type BootstrapStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

export interface BootstrapFailure {
  readonly message: string;
  readonly detail?: string | null;
}

export interface BootstrapGateProps {
  readonly status: BootstrapStatus;
  readonly error?: BootstrapFailure | null;
  readonly onRetry?: () => void;
  readonly slowAfterMs?: number;
  readonly children: ReactNode;
}

export const BOOTSTRAP_SLOW_MS = 1500;
export const BOOTSTRAP_ERROR_TITLE = "Scorebook couldn't open your data";
export const BOOTSTRAP_ERROR_BODY = 'Nothing has been changed.';

export type GatePhase = 'splash' | 'loading' | 'error' | 'ready';

export function gatePhase(status: BootstrapStatus, slow: boolean): GatePhase {
  switch (status) {
    case 'ready':
    case 'saving':
      return 'ready';
    case 'error':
      return 'error';
    case 'idle':
    case 'loading':
      return slow ? 'loading' : 'splash';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function BootstrapGate({ status, error, onRetry, slowAfterMs = BOOTSTRAP_SLOW_MS, children }: BootstrapGateProps) {
  const theme = useTheme();
  const [slow, setSlow] = useState(false);
  const waiting = status === 'loading' || status === 'idle';

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [waiting, slowAfterMs]);

  const phase = gatePhase(status, slow);
  useSplashRelease(phase !== 'splash');

  switch (phase) {
    case 'ready':
      return <>{children}</>;
    case 'splash':
      return <View testID="bootstrap-splash" style={[styles.fill, { backgroundColor: theme.color.background }]} />;
    case 'loading':
      return <LoadingView />;
    case 'error':
      return (
        <View style={[styles.fill, { backgroundColor: theme.color.background }]}>
          <ErrorState
            title={BOOTSTRAP_ERROR_TITLE}
            body={BOOTSTRAP_ERROR_BODY}
            details={error?.detail ?? null}
            onRetry={() => {
              setSlow(false);
              onRetry?.();
            }}
          />
        </View>
      );
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

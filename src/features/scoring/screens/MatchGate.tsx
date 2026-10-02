import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { ErrorState, Screen, Skeleton } from '@/ui';
import { useLiveMatchStore } from '@/stores';
import { InsetBody } from '../components/common/InsetBody';
import { TopBar } from '../components/common/TopBar';

export interface MatchGateProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function leaveMatch(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export function MatchGate({ title, children }: MatchGateProps) {
  const ready = useLiveMatchStore((s) => s.live !== null);
  const status = useLiveMatchStore((s) => s.status);
  const matchId = useLiveMatchStore((s) => s.matchId);
  const message = useLiveMatchStore((s) => s.error?.message ?? null);
  if (ready) {
    return <>{children}</>;
  }
  return (
    <Screen testID="match-gate" scroll={false} header={<TopBar title={title} onBack={leaveMatch} />}>
      <InsetBody>
        {status === 'error' ? (
          <ErrorState
            title="Couldn't open this match"
            body={message ?? 'Your data is safe on this device. Try again.'}
            onRetry={() => {
              if (matchId !== null) {
                void useLiveMatchStore.getState().open(matchId);
              }
            }}
            testID="match-gate-error"
          />
        ) : (
          <Skeleton rows={4} testID="match-gate-loading" />
        )}
      </InsetBody>
    </Screen>
  );
}

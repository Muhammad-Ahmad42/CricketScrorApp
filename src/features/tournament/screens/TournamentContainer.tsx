import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { TournamentId } from '@/domain/types';
import { NavHeader } from '@/features/shared';
import { ErrorState, Screen, Skeleton, space } from '@/ui';
import { useTournamentStore } from '@/stores';
import { errorHeadline } from '../hooks/toast';
import { useTournamentView } from '../hooks/useTournamentView';
import { routes } from '../routes';
import type { TournamentIndex } from '../selectors/names';

export type TournamentScreenWidth = 'column' | 'wide';

export interface TournamentContainerProps {
  readonly tournamentId: TournamentId;
  readonly testID: string;
  readonly title: string | ((index: TournamentIndex) => string);
  readonly subtitle?: (index: TournamentIndex) => string | null;
  readonly titleTestID?: string;
  readonly trailing?: (index: TournamentIndex) => ReactNode;
  readonly controls?: (index: TournamentIndex) => ReactNode;
  readonly scroll?: boolean;
  readonly width?: TournamentScreenWidth;
  readonly footer?: (index: TournamentIndex) => ReactNode;
  readonly backTo?: Href;
  readonly children: (index: TournamentIndex) => ReactNode;
}

export function useBack(fallback: Href): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  };
}

export function TournamentContainer({
  tournamentId,
  testID,
  title,
  subtitle,
  titleTestID,
  trailing,
  controls,
  scroll = true,
  width = 'wide',
  footer,
  backTo,
  children,
}: TournamentContainerProps) {
  const { index, status, error, loadedId } = useTournamentView();
  const back = useBack(backTo ?? routes.dashboard(tournamentId));
  const ready = index !== null && loadedId === tournamentId;
  const shownTitle = ready ? (typeof title === 'string' ? title : title(index)) : typeof title === 'string' ? title : 'Tournament';
  const pinned = ready && controls ? controls(index) : null;

  const body = () => {
    if (ready) {
      return scroll ? children(index) : <View style={styles.fill}>{children(index)}</View>;
    }
    if (status === 'error' || (error !== null && status !== 'loading')) {
      return (
        <ErrorState
          title="Couldn't open this tournament"
          body={errorHeadline(error)}
          onRetry={() => void useTournamentStore.getState().open(tournamentId)}
          testID="tournament-error"
        />
      );
    }
    return <Skeleton rows={5} testID="tournament-loading" />;
  };

  const footerNode = ready && footer ? footer(index) : null;

  return (
    <Screen
      testID={testID}
      scroll={!ready || scroll}
      wide={width === 'wide'}
      header={
        <View>
          <NavHeader
            title={shownTitle}
            subtitle={ready && subtitle ? subtitle(index) : null}
            onBack={back}
            titleTestID={titleTestID}
            trailing={ready && trailing ? trailing(index) : undefined}
          />
          {pinned ? <View style={styles.controls}>{pinned}</View> : null}
        </View>
      }
      footer={footerNode ? <View style={styles.footer}>{footerNode}</View> : undefined}
    >
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  controls: { gap: space.xs, paddingBottom: space.xxs },
  footer: { gap: space.xs },
});

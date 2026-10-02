import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useStackScreenOptions } from '@/ui';
import { useLiveMatchStore } from '@/stores';

export function useOpenMatch(matchId: string | undefined): void {
  useEffect(() => {
    if (matchId === undefined || matchId === '') {
      return undefined;
    }
    void useLiveMatchStore.getState().open(matchId);
    return () => {
      useLiveMatchStore.getState().close();
    };
  }, [matchId]);
}

export function MatchStackLayout({ matchId }: { readonly matchId: string | undefined }) {
  const screenOptions = useStackScreenOptions();
  useOpenMatch(matchId);
  return <Stack screenOptions={screenOptions} />;
}

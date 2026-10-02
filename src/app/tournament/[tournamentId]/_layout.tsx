import { Stack, useLocalSearchParams } from 'expo-router';
import { routeParam, useOpenTournament } from '@/features/tournament';
import { useStackScreenOptions } from '@/ui';

export default function TournamentLayout() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  useOpenTournament(routeParam(tournamentId));
  const screenOptions = useStackScreenOptions();
  return <Stack screenOptions={screenOptions} />;
}

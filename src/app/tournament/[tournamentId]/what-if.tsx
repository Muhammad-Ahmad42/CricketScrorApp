import { useLocalSearchParams } from 'expo-router';
import { WhatIfScreen, routeParam } from '@/features/tournament';

export default function TournamentWhatIfRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <WhatIfScreen tournamentId={routeParam(tournamentId)} />;
}

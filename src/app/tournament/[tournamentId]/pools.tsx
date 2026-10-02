import { useLocalSearchParams } from 'expo-router';
import { PoolsScreen, routeParam } from '@/features/tournament';

export default function TournamentPoolsRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <PoolsScreen tournamentId={routeParam(tournamentId)} />;
}

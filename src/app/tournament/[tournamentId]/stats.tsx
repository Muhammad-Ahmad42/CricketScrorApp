import { useLocalSearchParams } from 'expo-router';
import { StatsScreen, routeParam } from '@/features/tournament';

export default function TournamentStatsRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <StatsScreen tournamentId={routeParam(tournamentId)} />;
}

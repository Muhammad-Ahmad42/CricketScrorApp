import { useLocalSearchParams } from 'expo-router';
import { StandingsScreen, routeParam } from '@/features/tournament';

export default function TournamentStandingsRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <StandingsScreen tournamentId={routeParam(tournamentId)} />;
}

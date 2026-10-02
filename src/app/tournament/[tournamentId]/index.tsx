import { useLocalSearchParams } from 'expo-router';
import { DashboardScreen, routeParam } from '@/features/tournament';

export default function TournamentDashboardRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <DashboardScreen tournamentId={routeParam(tournamentId)} />;
}

import { useLocalSearchParams } from 'expo-router';
import { FixturesScreen, routeParam } from '@/features/tournament';

export default function TournamentFixturesRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <FixturesScreen tournamentId={routeParam(tournamentId)} />;
}

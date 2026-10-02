import { useLocalSearchParams } from 'expo-router';
import { AddFixtureScreen, routeParam } from '@/features/tournament';

export default function TournamentAddFixtureRoute() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  return <AddFixtureScreen tournamentId={routeParam(tournamentId)} />;
}

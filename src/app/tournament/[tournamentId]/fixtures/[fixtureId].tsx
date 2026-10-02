import { useLocalSearchParams } from 'expo-router';
import { FixtureDetailScreen, routeParam } from '@/features/tournament';

export default function TournamentFixtureRoute() {
  const { tournamentId, fixtureId } = useLocalSearchParams<{ tournamentId: string; fixtureId: string }>();
  return <FixtureDetailScreen tournamentId={routeParam(tournamentId)} fixtureId={routeParam(fixtureId)} />;
}
